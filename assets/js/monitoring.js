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

  await Promise.all([
    loadStatusBar(attentionRows, failCount),
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
async function loadNotifFailCount() { return 0; }
async function loadStatusBar(rows, failCount) {}
async function loadMetrics() {}
async function loadVolume() {}
async function loadCron() {}
async function loadAlertLog() {}

// ─── Realtime subscribe ───────────────────────────────────────────────────────
function setupRealtime() {
  window.db.channel('mon-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refreshAll())
    .subscribe();
  window.db.channel('mon-events')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_events' }, () => loadAlertLog())
    .subscribe();
}
