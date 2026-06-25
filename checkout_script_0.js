
// ─── Pilihan metode bayar ─────────────────────────────────────────────────────
let selectedChannel = 'QRIS'; // default

const PAYMENT_CHANNELS = [
  { group: 'QRIS',            channels: [
    { id: 'QRIS',    label: 'QRIS',    icon: '<i data-lucide="qr-code"></i>', desc: 'Scan QR — semua bank & e-wallet • Biaya admin 0.63%' },
  ]},
  { group: 'Virtual Account', channels: [
    { id: 'BNI',     label: 'BNI',     icon: '<i data-lucide="building-2"></i>', desc: 'Virtual Account BNI • Biaya admin Rp 4.000' },
    { id: 'BRI',     label: 'BRI',     icon: '<i data-lucide="building-2"></i>', desc: 'Virtual Account BRI • Biaya admin Rp 4.000' },
    { id: 'MANDIRI', label: 'Mandiri', icon: '<i data-lucide="building-2"></i>', desc: 'Virtual Account Mandiri • Biaya admin Rp 4.000' },
    { id: 'BJB',     label: 'BJB',     icon: '<i data-lucide="building-2"></i>', desc: 'Virtual Account BJB • Biaya admin Rp 4.000' },
    { id: 'BSI',     label: 'BSI',     icon: '<i data-lucide="building-2"></i>', desc: 'Virtual Account BSI • Biaya admin Rp 4.000' },
    { id: 'CIMB',    label: 'CIMB',    icon: '<i data-lucide="building-2"></i>', desc: 'Virtual Account CIMB • Biaya admin Rp 4.000' },
  ]},
];

// Logo per channel — letakkan file di assets/img/payment/{id.toLowerCase()}.png atau .webp
// Jika file tidak ada, otomatis fallback ke emoji
const CHANNEL_LOGO_EXT = { BJB: 'webp' };
function channelLogoHtml(ch) {
  const ext = CHANNEL_LOGO_EXT[ch.id] || 'png';
  return `
    <div style="width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center">
      <img src="assets/img/payment/${ch.id.toLowerCase()}.${ext}"
           alt="${ch.label}"
           style="width:36px;height:36px;object-fit:contain;border-radius:6px"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
      <span style="font-size:22px;display:none;align-items:center;justify-content:center;width:36px;height:36px">${ch.icon}</span>
    </div>`;
}

function selectChannel(id) {
  selectedChannel = id;
  document.querySelectorAll('.pay-method-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
}

function renderPage() {
  const _raw = checkoutData;
  const outletName    = escHtml(_raw.outletName);
  const outletAddress = escHtml(_raw.outletAddress);
  const customerName  = escHtml(_raw.customerName);
  const customerWA    = escHtml(_raw.customerWA);
  const pickupTime    = escHtml(_raw.pickupTime);
  const notes         = _raw.notes ? escHtml(_raw.notes) : '';
  const { cart } = _raw;

  const subtotal = getCartTotal(cart);
  const total    = subtotal - previewDiscount;

  // Update footer
  document.getElementById('fTotal').textContent      = formatRupiah(total);
  document.getElementById('footerPay').style.display = '';

  // Items HTML
  const itemsHtml = cart.map(item => {
    const sel = summarizeSelections(item.selections);
    return `<div class="summary-row">
      <span class="n">
        <b>${item.qty}× ${item.name}</b>
        ${sel ? `<br/><span style="color:var(--muted);font-size:12px">${sel}</span>` : ''}
        ${item.note ? `<br/><span style="color:var(--muted);font-size:12px"><i data-lucide="pencil" style="width:12px;height:12px;vertical-align:text-bottom"></i> ${escHtml(item.note)}</span>` : ''}
      </span>
      <span style="text-align:right;white-space:nowrap">${formatRupiah(item.unitPrice * item.qty)}</span>
    </div>`;
  }).join('');

  document.getElementById('pageContent').innerHTML = `

    <!-- Outlet -->
    <div class="info-card" style="margin-top:12px">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px"><i data-lucide="store" style="width:16px;height:16px;vertical-align:text-bottom"></i> Outlet Pickup</div>
      <div class="info-row">
        <span class="label">Outlet</span>
        <span class="val">${outletName}</span>
      </div>
      <div class="info-row">
        <span class="label">Alamat</span>
        <span class="val" style="font-size:13px;font-weight:500;color:var(--muted)">${outletAddress}</span>
      </div>
    </div>

    <!-- Data pemesan -->
    <div class="info-card">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px"><i data-lucide="user" style="width:16px;height:16px;vertical-align:text-bottom"></i> Data Pemesan</div>
      <div class="info-row">
        <span class="label">Nama</span>
        <span class="val">${customerName}</span>
      </div>
      <div class="info-row">
        <span class="label">WhatsApp</span>
        <span class="val">${customerWA}</span>
      </div>
      <div class="info-row">
        <span class="label">Waktu Ambil</span>
        <span class="val">${pickupTime}</span>
      </div>
      ${notes ? `<div class="info-row">
        <span class="label">Catatan</span>
        <span class="val" style="font-size:13px;font-weight:500;color:var(--muted)">${notes}</span>
      </div>` : ''}
    </div>

    <!-- Ringkasan pesanan -->
    <div class="info-card">
      <div style="font-weight:700;font-size:14px;margin-bottom:10px"><i data-lucide="utensils" style="width:16px;height:16px;vertical-align:text-bottom"></i> Pesanan</div>
      <div class="summary-box" style="margin-bottom:0">
        ${itemsHtml}
        <div class="summary-row total">
          <span>Subtotal</span><span>${formatRupiah(subtotal)}</span>
        </div>
      </div>
    </div>

    <!-- Rincian harga -->
    <div class="info-card">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px"><i data-lucide="receipt" style="width:16px;height:16px;vertical-align:text-bottom"></i> Total Pembayaran</div>
      ${previewDiscount > 0 ? `
      <div class="info-row">
        <span class="label">Subtotal</span>
        <span class="val">${formatRupiah(subtotal)}</span>
      </div>
      <div class="info-row" style="color:#16a34a">
        <span class="label"><i data-lucide="tag" style="width:14px;height:14px;vertical-align:text-bottom"></i> Diskon${previewPromoName ? ' — ' + escHtml(previewPromoName) : ''}</span>
        <span class="val" style="color:#16a34a">−${formatRupiah(previewDiscount)}</span>
      </div>` : ''}
      <div class="info-row" style="padding-top:4px">
        <span class="label" style="font-weight:700;font-size:15px;color:var(--ink)">Total</span>
        <span class="val" style="font-size:18px;font-weight:800;color:var(--brand)">${formatRupiah(total)}</span>
      </div>
    </div>

    <!-- Pilih metode bayar -->
    <div class="info-card">
      <div style="font-weight:700;font-size:14px;margin-bottom:12px"><i data-lucide="credit-card" style="width:16px;height:16px;vertical-align:text-bottom"></i> Metode Pembayaran</div>
      ${PAYMENT_CHANNELS.map(group => `
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px">${group.group}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${group.channels.map(ch => `
            <div class="pay-method-item"
              data-id="${ch.id}"
              onclick="selectChannel('${ch.id}')"
              style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:2px solid var(--line2);border-radius:10px;cursor:pointer;background:var(--card)">
              ${channelLogoHtml(ch)}
              <div style="flex:1">
                <div style="font-weight:700;font-size:13px">${ch.label}</div>
                <div style="font-size:11px;color:var(--muted)">${ch.desc}</div>
              </div>
              <div style="width:18px;height:18px;border-radius:50%;border:2px solid var(--line2);background:transparent;flex-shrink:0"></div>
            </div>`).join('')}
        </div>`).join('')}
    </div>

    <!-- Cek ulang sebelum konfirmasi -->
    <div style="margin:0 12px 12px;border-radius:12px;overflow:hidden;border:2px solid var(--brand)">
      <div style="background:var(--brand);padding:10px 14px;display:flex;align-items:center;gap:8px">
        <span style="font-size:18px"><i data-lucide="alert-triangle" style="width:20px;height:20px"></i></span>
        <span style="font-weight:800;font-size:13px;color:#fff;letter-spacing:.3px">PASTIKAN SEMUA SUDAH BENAR</span>
      </div>
      <div style="background:var(--brand-bg);padding:12px 14px">
        <div style="font-size:12px;color:var(--ink2);line-height:1.8;display:flex;flex-direction:column;gap:4px">
          <div><i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--green);vertical-align:text-bottom"></i> <b>Nama</b> dan <b>nomor WhatsApp</b> sudah benar</div>
          <div><i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--green);vertical-align:text-bottom"></i> <b>Outlet</b> yang dipilih sudah sesuai</div>
          <div><i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--green);vertical-align:text-bottom"></i> <b>Waktu ambil</b> sudah tepat</div>
          <div><i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--green);vertical-align:text-bottom"></i> <b>Menu & jumlah</b> pesanan sudah sesuai</div>
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--muted);line-height:1.5">
          Instruksi pembayaran akan muncul setelah konfirmasi sesuai metode yang dipilih.
        </div>
      </div>
    </div>

    <!-- Spacer agar konten tidak tertutup footer -->

    <div style="height:140px"></div>
  `;
  if (window.lucide) { lucide.createIcons(); }

  // Terapkan state awal melalui selectChannel — konsisten dengan interaksi berikutnya
  selectChannel(selectedChannel);
}

// ─── Submit ke Edge Function ──────────────────────────────────────────────────
let isSubmitting = false;

async function doCheckout() {
  if (isSubmitting) return;
  isSubmitting = true;

  const btnBayar = document.getElementById('btnBayar');
  btnBayar.disabled = true;
  document.getElementById('loadingOverlay').style.display = 'flex';

  try {
    // Kirim payment_channel yang dipilih customer
    const result = await submitXenditPayment({ ...checkoutData, paymentChannel: selectedChannel });

    // Simpan data order di sessionStorage untuk dibaca order.html
    sessionStorage.setItem('suka_order', JSON.stringify({
      order_number:        result.order_number,
      order_id:            result.order_id,
      total:               result.total,
      subtotal:            result.subtotal,
      service_fee:         result.service_fee,
      outlet_name:         checkoutData.outletName,
      outlet_address:      checkoutData.outletAddress,
      customer_name:       checkoutData.customerName,
      pickup_time:         checkoutData.pickupTime,
      payment_method:      result.payment_method,
      payment_channel:     result.payment_channel,
      payment_type:        result.payment_type,
      status:              'pending_payment',
      // QRIS
      qris_url:            result.qris_string,
      // Virtual Account
      va_number:           result.va_number,
      va_bank:             result.va_bank,
      // E-Wallet
      ewallet_deeplink:    result.ewallet_deeplink,
      // Common
      payment_request_id:  result.payment_request_id,
      expires_at:          result.expires_at,
      order_items:    checkoutData.cart.map(item => ({
        item_name:  item.name,
        quantity:   item.qty,
        unit_price: item.unitPrice,
        notes:      item.note || null,
      })),
    }));

    // Hapus cart setelah order berhasil dibuat
    clearCart(checkoutData.outletSlug);

    // Redirect ke halaman status order
    window.location.href = 'order.html?order=' + result.order_number;

  } catch (err) {
    document.getElementById('loadingOverlay').style.display = 'none';
    btnBayar.disabled = false;
    isSubmitting = false;
    showToast('<i data-lucide="x-circle" style="width:14px;height:14px;vertical-align:text-bottom"></i> ' + (err.message || 'Gagal memproses pesanan. Coba lagi.'), 4000);
  }
}

// ─── Fetch promo aktif & hitung diskon preview ───────────────────────────────
let previewDiscount = 0;
let previewPromoName = '';

async function fetchPromoPreview(subtotal) {
  if (!window.db) return;
  const nowIso = new Date().toISOString();
  try {
    const { data } = await window.db
      .from('promos')
      .select('id, name, discount_type, discount_value, max_discount, min_purchase')
      .eq('is_active', true)
      .eq('applies_to', 'all')
      .lte('min_purchase', subtotal)
      .or(`start_at.is.null,start_at.lte."${nowIso}"`)
      .or(`end_at.is.null,end_at.gte."${nowIso}"`)
      .order('priority', { ascending: false })
      .order('discount_value', { ascending: false })
      .limit(1);
    const p = data?.[0];
    if (!p) return;
    if (p.discount_type === 'percent') {
      previewDiscount = Math.round(subtotal * Number(p.discount_value) / 100);
      if (p.max_discount != null) previewDiscount = Math.min(previewDiscount, Number(p.max_discount));
    } else {
      previewDiscount = Math.min(Number(p.discount_value), subtotal);
    }
    previewDiscount = Math.max(0, previewDiscount);
    previewPromoName = p.name;
  } catch { /* promo preview gagal, lanjut tanpa diskon */ }
}

// ─── Init — baca sessionStorage dan render halaman ───────────────────────────
let checkoutData = null;

window.addEventListener('DOMContentLoaded', () => {
  const raw = sessionStorage.getItem('suka_checkout');
  try { checkoutData = raw ? JSON.parse(raw) : null; } catch { checkoutData = null; }

  if (!checkoutData || !checkoutData.cart || !checkoutData.cart.length) {
    document.getElementById('pageContent').innerHTML = `
      <div class="error-box" style="margin:24px 16px">
        <p>Data pesanan tidak ditemukan.<br/>Silakan kembali dan coba lagi.</p>
        <button class="btn-retry" onclick="window.location.href='index.html'">Ke Halaman Utama</button>
      </div>`;
    if (window.lucide) { lucide.createIcons(); }
  } else {
    const subtotal = getCartTotal(checkoutData.cart);
    fetchPromoPreview(subtotal).then(() => {
      renderPage();
      if (typeof sukaPixelTrack === 'function') {
        sukaPixelTrack('InitiateCheckout', { value: subtotal - previewDiscount, currency: 'IDR' });
      }
    });
  }
});
