
// ─── State ────────────────────────────────────────────────────────────────────
const orderNumber = getParam('order');
let order         = null;
let realtimeChannel = null;
let countdownTimer  = null;
let pollTimer       = null;

// Status terminal — tidak perlu poll lagi setelah ini
const TERMINAL_STATUSES = ['paid', 'done', 'cancelled', 'expired'];

// Channel groupings — satu sumber kebenaran, dipakai di renderStatus & post-render
const VA_CHANNELS      = ['BCA', 'BNI', 'BRI', 'MANDIRI'];
const EWALLET_CHANNELS = ['GOPAY', 'OVO', 'DANA'];
const EWALLET_ICONS    = { GOPAY: '<i data-lucide="wallet" color="#00a550"></i>', OVO: '<i data-lucide="wallet" color="#4c3494"></i>', DANA: '<i data-lucide="wallet" color="#118ee9"></i>' };

// Helper — derivasi channel dari order object (field DB atau cache)
function getChannel(o) { return o._payment_channel || o.payment_channel || 'QRIS'; }

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async function init() {
  if (!orderNumber) {
    renderError('Order tidak ditemukan. <a href="index.html">Kembali ke beranda</a>');
    return;
  }

  // Coba baca dari sessionStorage dulu (lebih cepat, data lengkap dari checkout)
  const cached = readCachedOrder();

  await loadOrder(cached);
});

function readCachedOrder() {
  try {
    const raw = sessionStorage.getItem('suka_order');
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o.order_number === orderNumber ? o : null;
  } catch { return null; }
}

// ─── Load order dari DB ───────────────────────────────────────────────────────
async function loadOrder(cached) {
  // Tampilkan data cache dulu (tidak perlu tunggu DB) agar user langsung lihat form upload
  if (cached && cached.status) renderStatus(cached);

  // Ambil order + outlet dari Supabase
  const { data, error } = await window.db
    .from('orders')
    .select('*, outlets(name, address, phone_wa), order_items(item_name, quantity, unit_price, note)')
    .eq('order_number', orderNumber)
    .single();

  if (error || !data) {
    // Kalau DB gagal tapi sudah ada cache dengan status → biarkan cache tampil
    if (!cached || !cached.status) {
      renderError('Order tidak ditemukan. Pastikan URL sudah benar.');
    }
    return;
  }

  order = data;

  // Merge display fields: DB wins, fallback ke cache, lalu default
  const PAYMENT_FIELDS = ['qris_url', 'va_number', 'va_bank', 'ewallet_deeplink', 'payment_channel', 'expires_at'];
  PAYMENT_FIELDS.forEach(f => {
    order[`_${f}`] = order[f] ?? (cached ? cached[f] : null);
  });
  order._payment_channel = order._payment_channel || 'QRIS'; // default QRIS

  // Items dari cache jika DB tidak return (kemungkinan RLS)
  if (cached && !order.order_items?.length && cached.order_items?.length) {
    order.order_items = cached.order_items;
  }



  renderStatus(order);
  subscribeRealtime(order.id);

  // Polling fallback tiap 5 detik — aktif jika status masih menunggu
  startPolling();
}

// ─── Polling fallback (backup jika Realtime tidak terpicu) ────────────────────
function startPolling() {
  stopPolling();
  if (!order || TERMINAL_STATUSES.includes(order.status)) return;

  pollTimer = setInterval(async () => {
    if (!order || TERMINAL_STATUSES.includes(order.status)) { stopPolling(); return; }

    const { data } = await window.db
      .from('orders')
      .select('status, cancelled_at, cancel_reason')
      .eq('order_number', orderNumber)
      .single();

    if (data && data.status !== order.status) {
      // Status berubah — reload penuh supaya semua data segar
      order = { ...order, ...data };
      renderStatus(order);
      if (TERMINAL_STATUSES.includes(data.status)) stopPolling();
    }
  }, 5000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ─── Subscribe realtime untuk update otomatis ─────────────────────────────────
function subscribeRealtime(orderId) {
  if (realtimeChannel) window.db.removeChannel(realtimeChannel);

  realtimeChannel = window.db
    .channel('order-' + orderId)
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'orders',
      filter: 'id=eq.' + orderId,
    }, payload => {
      const updated = { ...order, ...payload.new };
      updated._qris_url = order._qris_url;
      updated._pay_url  = order._pay_url;
      order = updated;
      renderStatus(order);
    })
    .subscribe();
}

// ─── Render UI berdasarkan status ─────────────────────────────────────────────
function renderStatus(o) {
  // Stop countdown lama jika ada
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

  const outlet = o.outlets || {};
  const outletName    = escHtml(outlet.name    || o.outlet_name    || '—');
  const outletAddress = escHtml(outlet.address || o.outlet_address || '');

  let heroHtml = '';
  let extraHtml = '';

  switch (o.status) {

    case 'pending_payment': {
      const channel    = getChannel(o);
      const isQris     = channel === 'QRIS';
      const isVA       = VA_CHANNELS.includes(channel);
      const isEwallet  = EWALLET_CHANNELS.includes(channel);
      const qrisStr    = o._qris_url         || '';
      const vaNumber   = o._va_number        || '';
      const vaBank     = o._va_bank          || channel;
      // Validasi protocol — hanya izinkan https:// dan deep link app resmi
      const _rawLink   = o._ewallet_deeplink || '';
      const ewalletLink= /^(https?:\/\/|gojek:\/\/|ovo:\/\/|dana:\/\/)/.test(_rawLink) ? _rawLink : '';

      const heroIcon  = isQris ? '<i data-lucide="qr-code"></i>' : isVA ? '<i data-lucide="building-2"></i>' : '<i data-lucide="credit-card"></i>';
      const heroTitle = isQris ? 'Scan QRIS untuk Bayar'
                      : isVA   ? `Transfer ke Virtual Account ${vaBank}`
                      :          `Bayar via ${channel}`;
      const heroSub   = isQris ? 'Buka m-banking atau e-wallet, pilih Bayar QRIS, lalu scan'
                      : isVA   ? `Salin nomor VA di bawah dan transfer dari m-banking mana saja`
                      :          `Tap tombol di bawah untuk buka aplikasi ${channel}`;

      heroHtml = `
        <div class="status-hero animated">
          <div class="status-icon animated" style="color:var(--brand)">${heroIcon}</div>
          <div class="status-title">${heroTitle}</div>
          <div class="status-sub">${heroSub}</div>
          <span class="status-chip status-pending">BELUM BAYAR</span>
        </div>`;

      // ── Konten per channel ──
      let paymentContent = '';

      if (isQris) {
        paymentContent = `
          <div class="info-card" style="text-align:center">
            <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:12px">Scan QR Code di bawah</div>
            ${qrisStr
              ? `<div id="qrisCanvas" style="display:flex;justify-content:center;margin-bottom:12px"></div>`
              : `<div style="padding:24px 0;color:var(--muted);font-size:13px">QR tidak tersedia.<br/>Silakan muat ulang halaman.</div>`
            }
            <div style="font-size:22px;font-weight:800;color:var(--brand);margin-bottom:4px">${formatRupiah(o.total)}</div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:12px" id="countdown">Menghitung waktu…</div>
            <button id="btnCekStatus" class="btn-add-big" onclick="doCekStatus()"
              style="background:var(--brand-bg);color:var(--brand);font-weight:700;margin-bottom:0">
              Sudah Bayar? Cek Status
            </button>
          </div>
          <div style="margin:0 12px 10px;padding:10px 14px;background:#fef9c3;border-radius:10px;font-size:12px;line-height:1.8;color:#854d0e">
            <div style="display:flex;gap:8px;align-items:flex-start"><i data-lucide="smartphone" style="width:16px;height:16px;flex-shrink:0;margin-top:2px"></i> <span><b>Cara bayar:</b> Buka m-banking / GoPay / OVO / DANA → Scan QR → Konfirmasi <b>${formatRupiah(o.total)}</b>
          </div>`;
      }

      if (isVA) {
        const bankInstructions = {
          BCA:     'ATM / m-Banking BCA → Transfer → BCA Virtual Account',
          BNI:     'ATM / m-Banking BNI → Virtual Account Billing → Bayar Tagihan',
          BRI:     'ATM / m-Banking BRImo → Pembayaran → Virtual Account',
          MANDIRI: 'ATM / Livin → Bayar → Multi Payment → kode 70012',
        };
        paymentContent = `
          <div class="info-card">
            <div style="font-weight:700;font-size:14px;margin-bottom:10px"><i data-lucide="building-2" style="width:16px;height:16px;vertical-align:text-bottom;display:inline-block"></i> Virtual Account ${vaBank}</div>
            <div class="info-row">
              <span class="label">Bank</span>
              <span class="val" style="font-weight:700">${vaBank}</span>
            </div>
            <div class="info-row">
              <span class="label">Nomor VA</span>
              <div style="display:flex;align-items:center;gap:8px;flex:1">
                <span style="font-weight:800;font-family:monospace;font-size:16px;letter-spacing:1px">${vaNumber || '—'}</span>
                ${vaNumber ? `<button onclick="copyVA('${vaNumber}')" id="btnCopyVA"
                  style="flex-shrink:0;background:var(--brand-bg);color:var(--brand);border:0;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">
                  Salin</button>` : ''}
              </div>
            </div>
            <div class="info-row" style="border-top:1px dashed var(--line2);margin-top:6px;padding-top:10px">
              <span class="label" style="font-weight:700">Total Transfer</span>
              <span class="val" style="font-size:18px;font-weight:800;color:var(--brand)">${formatRupiah(o.total)}</span>
            </div>
            <div style="margin-top:12px;font-size:12px;color:var(--muted);line-height:1.6;background:var(--bg);padding:10px;border-radius:8px">
              <div style="display:flex;gap:8px;align-items:flex-start"><i data-lucide="clipboard-type" style="width:16px;height:16px;flex-shrink:0;margin-top:2px"></i> <span><b>Cara bayar:</b> ${bankInstructions[vaBank] || `m-Banking ${vaBank} → Virtual Account`}
            </span></div>
          </div>
          <div style="margin:0 12px 10px;padding:10px 14px;background:var(--brand-bg);border-radius:10px;font-size:12px;line-height:1.6;color:var(--ink2)">
            <div style="display:flex;gap:8px;align-items:flex-start"><i data-lucide="alert-triangle" style="width:16px;height:16px;flex-shrink:0;margin-top:2px"></i> <span>Transfer <b>tepat ${formatRupiah(o.total)}</b> — nominal harus sama persis
          </span></div>
          <div style="margin:0 12px 10px">
            <div style="font-size:12px;color:var(--muted);margin-bottom:6px" id="countdown">Menghitung waktu…</div>
            <button id="btnCekStatus" class="btn-add-big" onclick="doCekStatus()"
              style="background:var(--brand-bg);color:var(--brand);font-weight:700">
              Sudah Transfer? Cek Status
            </button>
          </div>`;
      }

      if (isEwallet) {
        paymentContent = `
          <div class="info-card" style="text-align:center">
            <div style="font-size:48px;margin-bottom:8px">${EWALLET_ICONS[channel] ?? '<i data-lucide="credit-card" style="width:16px;height:16px;vertical-align:text-bottom;display:inline-block"></i>'}</div>
            <div style="font-size:22px;font-weight:800;color:var(--brand);margin-bottom:4px">${formatRupiah(o.total)}</div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:16px" id="countdown">Menghitung waktu…</div>
            ${ewalletLink
              ? `<a href="${ewalletLink}" class="btn-add-big" style="display:block;text-decoration:none;text-align:center;margin-bottom:10px">
                   Buka ${channel} untuk Bayar
                 </a>`
              : `<div style="color:var(--muted);font-size:13px;padding:12px 0">Link pembayaran tidak tersedia.<br/>Hubungi admin.</div>`
            }
            <button id="btnCekStatus" class="btn-add-big" onclick="doCekStatus()"
              style="background:var(--brand-bg);color:var(--brand);font-weight:700;margin-bottom:0">
              Sudah Bayar? Cek Status
            </button>
          </div>`;
      }

      extraHtml = paymentContent + `
        <div style="margin:0 12px 12px;padding:10px 14px;background:#e0f2fe;border-radius:10px;font-size:12px;line-height:1.5;color:#075985">
          <div style="display:flex;gap:8px;align-items:flex-start"><i data-lucide="lock" style="width:16px;height:16px;flex-shrink:0;margin-top:2px"></i> <span><b>Jangan tutup tab ini</b> sampai status berubah jadi "Pembayaran Dikonfirmasi"
        </div>`;
      break;
    }

    case 'paid': {
      const channel  = getChannel(o);
      const payLabel = channel === 'QRIS' ? 'QRIS' : VA_CHANNELS.includes(channel) ? `VA ${channel}` : channel || 'digital';
      // Lewati order tes (di bawah Rp1.000) agar tidak mengotori data Purchase — selaras dgn xendit-webhook
      if (Number(o.total) >= 1000 && !sessionStorage.getItem('pixel_purchase_' + o.order_number)) {
        sessionStorage.setItem('pixel_purchase_' + o.order_number, '1');
        // eventID = order_number → Meta deduplikasi dgn Conversions API (xendit-webhook)
        sukaPixelTrack('Purchase', { value: o.total, currency: 'IDR', order_id: o.order_number }, { eventID: o.order_number });
      }
      heroHtml = `
        <div class="status-hero animated">
          <div class="status-icon success-animated"><i data-lucide="check" style="width:40px;height:40px"></i></div>
          <div class="status-title">Pembayaran Dikonfirmasi!</div>
          <div class="status-sub">Pembayaran ${payLabel} berhasil — outlet sedang menyiapkan pesananmu</div>
          <span class="status-chip status-paid">DIKONFIRMASI</span>
        </div>`;
      break;
    }

    case 'preparing':
      heroHtml = `
        <div class="status-hero animated">
          <div class="status-icon animated" style="color:#ea580c"><i data-lucide="chef-hat" style="width:40px;height:40px"></i></div>
          <div class="status-title">Sedang Disiapkan</div>
          <div class="status-sub">Outlet sedang memproses pesananmu</div>
          <span class="status-chip status-preparing">DIPROSES</span>
        </div>`;
      break;

    case 'ready':
      heroHtml = `
        <div class="status-hero animated">
          <div class="status-icon animated" style="color:#0284c7"><i data-lucide="party-popper" style="width:40px;height:40px"></i></div>
          <div class="status-title">Pesanan Siap Diambil!</div>
          <div class="status-sub">Tunjukkan kode ini ke kasir</div>
          <span class="status-chip status-ready">SIAP DIAMBIL</span>
        </div>`;

      extraHtml = `
        <div class="info-card" style="text-align:center">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Kode Order</div>
          <div class="order-number-big">${o.order_number}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px">Tunjukkan nomor di atas ke kasir</div>
        </div>`;
      break;

    case 'done':
      heroHtml = `
        <div class="status-hero animated">
          <div class="status-icon animated" style="color:#16a34a"><i data-lucide="shopping-bag" style="width:40px;height:40px"></i></div>
          <div class="status-title">Selesai!</div>
          <div class="status-sub">Terima kasih sudah pesan di SUKA Shawarma</div>
          <span class="status-chip status-done">SELESAI</span>
        </div>`;

      extraHtml = `
        <div class="info-card" style="text-align:center">
          <a href="index.html" class="btn-add-big" style="display:block;text-decoration:none;text-align:center">
            Pesan Lagi
          </a>
        </div>`;
      break;

    case 'cancelled':
      heroHtml = `
        <div class="status-hero animated">
          <div class="status-icon animated" style="color:#dc2626"><i data-lucide="x-circle" style="width:40px;height:40px"></i></div>
          <div class="status-title">Pesanan Dibatalkan</div>
          <div class="status-sub">${escHtml(o.cancel_reason) || 'Pesanan dibatalkan oleh outlet'}</div>
          <span class="status-chip status-cancelled">DIBATALKAN</span>
        </div>`;

      extraHtml = `
        <div class="info-card" style="text-align:center">
          <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
            Jika sudah membayar, refund diproses 1–3 hari kerja.
          </div>
          <a href="index.html" class="btn-add-big" style="display:block;text-decoration:none;text-align:center">
            Pesan Ulang
          </a>
        </div>`;
      break;

    case 'expired':
      heroHtml = `
        <div class="status-hero animated">
          <div class="status-icon animated" style="color:#d97706"><i data-lucide="hourglass" style="width:40px;height:40px"></i></div>
          <div class="status-title">Pesanan Kedaluwarsa</div>
          <div class="status-sub">Waktu pembayaran habis. Silakan pesan ulang.</div>
          <span class="status-chip status-expired">KEDALUWARSA</span>
        </div>`;

      extraHtml = `
        <div class="info-card" style="text-align:center">
          <a href="index.html"
             class="btn-add-big" style="display:block;text-decoration:none;text-align:center">
            Pesan Ulang
          </a>
        </div>`;
      break;

    default:
      heroHtml = `
        <div class="status-hero animated">
          <div class="status-icon animated" style="color:var(--muted)"><i data-lucide="loader-2" class="lucide-spin" style="width:40px;height:40px"></i></div>
          <div class="status-title">Memproses…</div>
          <div class="status-sub">Mohon tunggu sebentar</div>
        </div>`;
  }

  // Info order bawah
  const fmtOrderTime = t => {
    if (!t) return '—';
    const d = new Date(t);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      + ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const items = o.order_items || [];
  const itemsHtml = items.length ? `
    <div style="margin:8px 0 4px;padding-top:8px;border-top:1px solid var(--line)">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Item Dipesan</div>
      ${items.map(it => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:5px 0;font-size:13px">
          <div style="flex:1;min-width:0">
            <span style="font-weight:600">${it.quantity}× ${escHtml(it.item_name)}</span>
            ${it.note ? `<div style="font-size:11px;color:var(--muted);margin-top:1px"><i data-lucide="pencil" style="width:12px;height:12px;vertical-align:text-bottom"></i> ${escHtml(it.note)}</div>` : ''}
          </div>
          <span style="font-weight:700;white-space:nowrap;margin-left:10px">${formatRupiah(it.unit_price * it.quantity)}</span>
        </div>`).join('')}
    </div>` : '';

  const infoHtml = `
    <details style="margin:0 12px 12px;background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden">
      <summary style="padding:12px 14px;font-weight:700;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;list-style:none;-webkit-appearance:none">
        <span style="display:flex;align-items:center;gap:6px"><i data-lucide="clipboard-list" style="width:16px;height:16px"></i> Detail Pesanan</span>
        <span style="font-size:11px;color:var(--muted);font-weight:500">Lihat ▾</span>
      </summary>
      <div style="padding:0 14px 12px;border-top:1px solid var(--line)">
        <div class="info-row" style="padding-top:8px">
          <span class="label">No. Order</span>
          <span class="val" style="font-family:monospace;font-size:13px">${o.order_number}</span>
        </div>
        <div class="info-row">
          <span class="label">Outlet</span>
          <span class="val">${outletName}</span>
        </div>
        ${o.pickup_time ? `<div class="info-row">
          <span class="label">Waktu Ambil</span>
          <span class="val" style="font-weight:700">${escHtml(o.pickup_time)}</span>
        </div>` : ''}
        ${itemsHtml}
        ${o.discount > 0 ? `
        <div class="info-row" style="margin-top:6px">
          <span class="label">Subtotal</span>
          <span class="val">${formatRupiah(o.subtotal)}</span>
        </div>
        <div class="info-row" style="color:#16a34a">
          <span class="label">Diskon${o.promo_name ? ' — ' + escHtml(o.promo_name) : ''}</span>
          <span class="val" style="color:#16a34a">−${formatRupiah(o.discount)}</span>
        </div>` : ''}
        <div class="info-row" style="border-top:1px dashed var(--line2);margin-top:6px;padding-top:8px">
          <span class="label" style="font-weight:700">Total</span>
          <span class="val" style="font-size:16px;font-weight:800;color:var(--brand)">${formatRupiah(o.total)}</span>
        </div>
      </div>
    </details>
    <div style="height:32px"></div>`;

  document.getElementById('pageContent').innerHTML = heroHtml + extraHtml + infoHtml;
  if (window.lucide) { lucide.createIcons(); }

  // Post-render hooks per status
  if (o.status === 'ready') {
    renderOrderQR(o.order_number);
  }
  if (o.status === 'pending_payment') {
    const channel = getChannel(o);
    const isQris  = channel === 'QRIS';

    // Render QRIS QR code (hanya untuk channel QRIS)
    if (isQris) {
      const qrisStr = o._qris_url || o.qris_url || '';
      if (qrisStr) {
        const canvas = document.getElementById('qrisCanvas');
        if (canvas) {
          try {
            new QRCode(canvas, {
              text: qrisStr,
              width: 220,
              height: 220,
              correctLevel: QRCode.CorrectLevel.M,
            });
          } catch (e) { console.warn('QR render error:', e); }
        }
      }
    }

    // Mulai countdown untuk semua channel
    const expiresAt = o._expires_at || o.expires_at;
    if (expiresAt) startCountdownUI(expiresAt);
  }
}

// ─── Salin nomor VA ke clipboard ──────────────────────────────────────────────
function copyVA(vaNumber) {
  navigator.clipboard.writeText(vaNumber).then(() => {
    const btn = document.getElementById('btnCopyVA');
    if (!btn) return;
    btn.textContent = '<i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--green);vertical-align:text-bottom;display:inline-block"></i> Disalin!';
    btn.style.background = '#f0fdf4';
    btn.style.color = '#16a34a';
    setTimeout(() => {
      btn.textContent = 'Salin';
      btn.style.background = 'var(--brand-bg)';
      btn.style.color = 'var(--brand)';
    }, 2000);
  }).catch(() => showToast('Salin manual: ' + vaNumber));
}

// loadSignedProofUrl tidak lagi dipakai — upload bukti transfer diganti QRIS

// buildQrisBox tidak lagi dipakai — QR render langsung di renderStatus case pending_payment

// ─── Render QR untuk order number (state ready) ───────────────────────────────
function renderOrderQR(orderNum) {
  const wrap = document.getElementById('qrOrderWrap');
  if (!wrap) return;
  try {
    new QRCode(wrap, {
      text:         orderNum,
      width:        180,
      height:       180,
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (e) {
    wrap.style.display = 'none';
  }
}

// ─── Countdown timer ──────────────────────────────────────────────────────────
function startCountdownUI(expiresAt) {
  function tick() {
    const el = document.getElementById('countdown');
    if (!el) return;
    const ms = new Date(expiresAt) - Date.now();
    if (ms <= 0) {
      el.textContent = '⌛ Waktu habis';
      el.style.color = 'var(--brand)';
      // Update UI ke expired tanpa tunggu realtime
      setTimeout(() => {
        if (order && order.status === 'pending_payment') {
          order.status = 'expired';
          renderStatus(order);
        }
      }, 1500);
      return;
    }
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    el.textContent = `⏱ Berakhir dalam ${m}:${String(s).padStart(2, '0')}`;
    if (ms < 60000) el.style.color = 'var(--brand)';
    countdownTimer = setTimeout(tick, 1000);
  }
  tick();
}

// ─── Tombol "Sudah Bayar? Cek Status" ────────────────────────────────────────
let isCheking = false;

async function doCekStatus() {
  if (isCheking) return;
  isCheking = true;

  const btn = document.getElementById('btnCekStatus');
  if (btn) { btn.textContent = 'Mengecek…'; btn.disabled = true; }

  try {
    const result = await checkOrderStatus(orderNumber);
    if (result.synced && result.status !== 'pending_payment') {
      // Status berubah — reload dari DB
      await loadOrder(null);
    } else {
      showToast(result.status === 'pending_payment'
        ? '⏳ Pembayaran belum terdeteksi. Tunggu sebentar.'
        : '<i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--green);vertical-align:text-bottom;display:inline-block"></i> Status diperbarui');
    }
  } catch (err) {
    showToast('Gagal cek status. Coba lagi.');
  } finally {
    isCheking = false;
    const b = document.getElementById('btnCekStatus');
    if (b) { b.textContent = 'Sudah Bayar? Cek Status'; b.disabled = false; }
  }
}

// copyRek, previewProof, doUploadProof — dihapus, tidak dipakai di flow QRIS

// ─── Error display ────────────────────────────────────────────────────────────
function renderError(msg) {
  document.getElementById('pageContent').innerHTML = `
    <div class="error-box" style="margin:24px 16px">
      <p>${msg}</p>
      <button class="btn-retry" onclick="window.location.href='index.html'">Ke Beranda</button>
    </div>`;
}
