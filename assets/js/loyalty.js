// assets/js/loyalty.js — Helper untuk loyalty program
// Dimuat setelah admin.js di halaman yang butuh loyalty

// ── Generate kode voucher unik (8 karakter) ──────────────────────────────────
function generateVoucherCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // hindari 0/O, 1/I
  let code = 'SS';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code; // contoh: SSAB3K9P
}

// ── Format stats customer ─────────────────────────────────────────────────────
function fmtLoyaltyStats(customer) {
  return `${customer.total_orders}× order · ${formatRupiah(customer.total_spent)}`;
}

// ── Cek milestone yang tepat tercapai ────────────────────────────────────────
function checkMilestoneHit(totalOrders, settings) {
  return [1, 2, 3].map(n => ({
    count:  parseInt(settings[`loyalty_milestone_${n}`]?.value ?? '9999'),
    reward: settings[`loyalty_reward_${n}`]?.value ?? '',
    n,
  })).find(m => m.count === totalOrders) || null;
}

// ── Ambil milestone berikutnya yang belum diraih ──────────────────────────────
function getNextMilestone(totalOrders, settings) {
  const milestones = [1, 2, 3].map(n => ({
    count:  parseInt(settings[`loyalty_milestone_${n}`]?.value ?? '9999'),
    reward: settings[`loyalty_reward_${n}`]?.value ?? '',
    n,
  })).filter(m => m.count > totalOrders);
  return milestones.sort((a, b) => a.count - b.count)[0] || null;
}

// ── Progress bar milestone (0-100) ────────────────────────────────────────────
function getMilestoneProgress(totalOrders, settings) {
  const milestones = [1, 2, 3]
    .map(n => parseInt(settings[`loyalty_milestone_${n}`]?.value ?? '9999'))
    .sort((a, b) => a - b);
  const next = milestones.find(m => m > totalOrders);
  const prev = milestones.filter(m => m <= totalOrders).pop() || 0;
  if (!next) return { pct: 100, next: null, prev, current: totalOrders };
  const pct = ((totalOrders - prev) / (next - prev)) * 100;
  return { pct, next, prev, current: totalOrders };
}
