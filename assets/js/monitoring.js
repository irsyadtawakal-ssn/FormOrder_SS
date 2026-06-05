// assets/js/monitoring.js — Dashboard monitoring kesehatan sistem (super_admin only)
// Dimuat setelah supabase.js + utils.js + admin.js

// ─── Konstanta ────────────────────────────────────────────────────────────────
const STUCK_PENDING_MIN = 15;  // order pending_payment dianggap nyangkut setelah X menit
const STUCK_PAID_MIN    = 20;  // order paid belum preparing dianggap nyangkut setelah X menit

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
  const u = await requireSuperAdmin(); // redirect ke index.html jika bukan super_admin
  if (!u) return;
  await refreshAll();
  setupRealtime();
});

// ─── Refresh semua panel ──────────────────────────────────────────────────────
async function refreshAll() {
  // Sembunyikan skeleton, tampilkan konten
  const skeleton = document.querySelector('#pageContent .stat-grid');
  const monContent = document.getElementById('monContent');
  if (skeleton) skeleton.style.display = 'none';
  if (monContent) monContent.style.display = 'block';

  // Jalankan semua panel paralel (kecuali statusBar yang butuh hasil loadAttention + loadMetrics)
  const [attentionRows, failCount] = await Promise.all([
    loadAttention(),
    loadNotifFailCount(),
  ]);

  const healthSnap = await loadHealthCheck();

  await Promise.all([
    loadStatusBar(attentionRows, failCount, healthSnap),
    loadMetrics(),
    loadVolume(),
    loadCron(),
    loadAlertLog(),
  ]);
}

// ─── Placeholder fungsi panel (diisi di task berikutnya) ─────────────────────
async function loadAttention() {
  const now = Date.now();
  const pendingCut = new Date(now - STUCK_PENDING_MIN * 60000).toISOString();
  const paidCut    = new Date(now - STUCK_PAID_MIN    * 60000).toISOString();

  const [pendingRes, paidRes] = await Promise.all([
    window.db.from('orders')
      .select('id, order_number, status, created_at, customer_name, outlets(name)')
      .eq('status', 'pending_payment')
      .lt('created_at', pendingCut),
    window.db.from('orders')
      .select('id, order_number, status, paid_at, customer_name, outlets(name)')
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .lt('paid_at', paidCut),
  ]);

  const rows = [...(pendingRes.data || []), ...(paidRes.data || [])];

  const el = document.getElementById('attentionPanel');
  if (!el) return rows;

  if (!rows.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">✅ Tidak ada order nyangkut</p>';
    return rows;
  }

  el.innerHTML = rows.map(o => {
    const outlet = (o.outlets && o.outlets.name) ? o.outlets.name : '—';
    const ts     = o.status === 'paid' ? o.paid_at : o.created_at;
    return `<a class="attention-row" href="/admin/orders.html" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--card);border-radius:10px;margin-bottom:6px;text-decoration:none;color:inherit;border-left:3px solid var(--danger,#e53)">
      <div>
        <div style="font-family:monospace;font-size:11px;color:var(--muted)">${escHtml(o.order_number)}</div>
        <div style="font-weight:600;font-size:13px">${escHtml(o.customer_name)}</div>
        <div style="font-size:11px;color:var(--muted)">${escHtml(outlet)}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:var(--muted)">
        ${statusBadge(o.status)}<br>${fmtTimeAgo(ts)}
      </div>
    </a>`;
  }).join('');

  return rows;
}
async function loadNotifFailCount() {
  const h1 = new Date(Date.now() - 3600000).toISOString();
  const { count } = await window.db
    .from('notification_logs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('sent_at', h1);
  return count ?? 0;
}

async function loadMetrics() {
  const h24 = new Date(Date.now() - 86400000).toISOString();
  const h1  = new Date(Date.now() - 3600000).toISOString();

  const [paid24, expired24, fail1] = await Promise.all([
    window.db.from('orders').select('id', { count: 'exact', head: true })
      .in('status', ['paid','preparing','ready','done']).gte('created_at', h24),
    window.db.from('orders').select('id', { count: 'exact', head: true })
      .in('status', ['expired','cancelled']).gte('created_at', h24),
    window.db.from('notification_logs').select('id', { count: 'exact', head: true })
      .eq('status', 'failed').gte('sent_at', h1),
  ]);

  const cards = [
    { icon: '✅', value: paid24.count ?? 0,   label: 'Order Bayar (24j)' },
    { icon: '❌', value: expired24.count ?? 0, label: 'Expired/Batal (24j)' },
    { icon: '📵', value: fail1.count ?? 0,     label: 'Notif Gagal (60m)' },
  ];

  const el = document.getElementById('metricCards');
  if (!el) return;
  el.innerHTML = cards.map(c =>
    `<div class="stat-card" style="text-align:center">
      <div style="font-size:20px;margin-bottom:2px">${c.icon}</div>
      <div style="font-weight:800;font-size:22px;color:var(--ink)">${c.value}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${c.label}</div>
    </div>`
  ).join('');
}

function lamp(state) {
  return { green: '🟢', yellow: '🟡', red: '🔴', gray: '⚠️' }[state] || '⚠️';
}

// Panggil Edge Function system-health-check, return snapshot atau null jika gagal
async function loadHealthCheck() {
  try {
    const { data: { session } } = await window.db.auth.getSession();
    if (!session) return null;
    const r = await fetch(`${window.SUKA_CONFIG.supabaseUrl}/functions/v1/system-health-check`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!r.ok) {
      console.warn('health-check gagal:', r.status);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.warn('health-check error:', e);
    return null;
  }
}

// Analisis snapshot health-check, return status lampu per komponen
function lampFromHealth(snap) {
  if (!snap) return { pembayaran: 'gray', layanan: 'gray', wa_device: 'gray' };

  const recon = snap.reconcile || {};
  const pembayaran = (recon.paid_but_unsynced?.length) ? 'red' : 'green';
  const pingOk = snap.ping?.site?.ok && snap.ping?.xendit?.ok;
  const layanan = pingOk ? 'green' : 'red';
  const wa_device = snap.fonnte?.connected === false ? 'red'
                  : snap.fonnte?.connected === true ? 'green'
                  : 'gray';

  return { pembayaran, layanan, wa_device };
}

async function loadStatusBar(attentionRows, failCount, healthSnap) {
  const health = lampFromHealth(healthSnap);

  // Order Flow: merah jika >3 nyangkut, kuning jika ada, hijau jika tidak ada
  const orderFlow = attentionRows.length === 0 ? 'green'
                  : attentionRows.length > 3   ? 'red'
                  : 'yellow';

  // WA Notif: gabung status device Fonnte + rasio notif failed
  const wa = health.wa_device === 'red' ? 'red'
           : failCount === 0 ? 'green'
           : failCount > 3 ? 'red'
           : 'yellow';

  const lamps = [
    { key: 'Pembayaran', state: health.pembayaran, note: health.pembayaran === 'red' ? '⚠️ Mismatch Xendit' : '✓' },
    { key: 'WA Notif',   state: wa,        note: health.wa_device === 'gray' ? 'Fonnte unknown' : (health.wa_device === 'red' ? 'Device disconnect' : `${failCount} gagal 60m`) },
    { key: 'Order Flow', state: orderFlow, note: `${attentionRows.length} nyangkut` },
    { key: 'Layanan',    state: health.layanan, note: health.layanan === 'red' ? 'Ping gagal' : '✓' },
  ];

  const el = document.getElementById('statusBar');
  if (!el) return;
  el.innerHTML = lamps.map(l =>
    `<div style="display:flex;flex-direction:column;align-items:center;background:var(--card);border-radius:12px;padding:10px 14px;min-width:72px;gap:3px">
      <span style="font-size:22px">${lamp(l.state)}</span>
      <span style="font-size:11px;font-weight:700;color:var(--ink)">${l.key}</span>
      <span style="font-size:10px;color:var(--muted)">${l.note}</span>
    </div>`
  ).join('');
}

async function loadVolume() {
  const since = new Date(Date.now() - 12 * 3600000).toISOString();
  const { data } = await window.db
    .from('orders')
    .select('created_at')
    .gte('created_at', since);

  const buckets = {};
  (data || []).forEach(o => {
    const h = new Date(o.created_at).getHours();
    buckets[h] = (buckets[h] || 0) + 1;
  });

  const currentHour = new Date().getHours();
  const hours = Array.from({ length: 12 }, (_, i) => (currentHour - 11 + i + 24) % 24);
  const max   = Math.max(1, ...hours.map(h => buckets[h] || 0));

  const el = document.getElementById('volumeChart');
  if (!el) return;

  el.innerHTML = hours.map(h => {
    const v    = buckets[h] || 0;
    const open = h >= 13 && h <= 22;
    const zero = open && v === 0;
    const pct  = Math.round((v / max) * 56); // max bar height 56px (container 70px - label)
    const bg   = zero ? '#e53935' : 'var(--brand)';
    return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;gap:2px">
      <div style="font-size:9px;color:var(--muted)">${v || ''}</div>
      <div style="width:100%;height:${Math.max(2, pct)}px;background:${bg};border-radius:3px 3px 0 0;min-height:2px"></div>
      <div style="font-size:9px;color:${open ? 'var(--ink)' : 'var(--muted)'}">${h}</div>
    </div>`;
  }).join('');
}
async function loadCron() {
  const { data } = await window.db
    .from('cron_heartbeat')
    .select('*')
    .order('job_name');

  const el = document.getElementById('cronPanel');
  if (!el) return;

  if (!data || !data.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">⏳ Belum ada heartbeat (deploy fungsi dulu)</p>';
    return;
  }

  el.innerHTML = data.map(c => {
    const ageMin = (Date.now() - new Date(c.last_run).getTime()) / 60000;
    const dead   = ageMin > 5;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--card);border-radius:10px;margin-bottom:6px">
      <div>
        <span style="font-size:16px">${dead ? '🔴' : '🟢'}</span>
        <span style="font-weight:600;font-size:13px;margin-left:8px">${escHtml(c.job_name)}</span>
      </div>
      <div style="font-size:11px;color:var(--muted)">${fmtTimeAgo(c.last_run)}</div>
    </div>`;
  }).join('');
}
async function loadAlertLog() {
  const { data } = await window.db
    .from('system_events')
    .select('created_at, level, message, source')
    .in('event_type', ['alert_sent', 'alert_resolved'])
    .order('created_at', { ascending: false })
    .limit(20);

  const el = document.getElementById('alertLog');
  if (!el) return;

  if (!data || !data.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">Belum ada alert terkirim</p>';
    return;
  }

  el.innerHTML = data.map(e => {
    const icon = e.level === 'error' ? '🔴' : e.level === 'warn' ? '🟡' : '✅';
    return `<div style="padding:8px 12px;background:var(--card);border-radius:10px;margin-bottom:6px;font-size:12px">
      <span>${icon}</span>
      <span style="color:var(--muted);margin:0 6px">${fmtTimeAgo(e.created_at)}</span>
      <span>${escHtml(e.message)}</span>
    </div>`;
  }).join('');
}

// ─── Realtime subscribe ───────────────────────────────────────────────────────
function setupRealtime() {
  window.db.channel('mon-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refreshAll())
    .subscribe();
  window.db.channel('mon-events')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_events' }, () => loadAlertLog())
    .subscribe();
}
