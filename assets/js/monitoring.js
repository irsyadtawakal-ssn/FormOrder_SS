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
async function loadAttention() { return []; }
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
