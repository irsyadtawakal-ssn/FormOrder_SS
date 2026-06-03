// assets/js/admin.js — Shared admin utilities
// Dimuat setelah supabase.js + utils.js di semua halaman admin

// ─── State ────────────────────────────────────────────────────────────────────
let adminUser = null; // { id, email, full_name, role, outlet_id, is_active }

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function requireAuth() {
  const { data: { user } } = await window.db.auth.getUser();
  if (!user) {
    window.location.replace('login.html');
    return null;
  }

  const { data: profile, error } = await window.db
    .from('admin_users')
    .select('id, full_name, role, outlet_id, is_active')
    .eq('id', user.id)
    .single();

  if (error || !profile || !profile.is_active) {
    await window.db.auth.signOut();
    window.location.replace('login.html');
    return null;
  }

  adminUser = { ...profile, email: user.email };
  _applyRoleVisibility();
  _renderAdminMeta();
  startOrderNotifications(adminUser); // mulai notif realtime di semua halaman
  return adminUser;
}

async function requireSuperAdmin() {
  const u = await requireAuth();
  if (!u) return null;
  if (u.role !== 'super_admin') {
    window.location.replace('index.html');
    return null;
  }
  return u;
}

async function adminSignOut() {
  await window.db.auth.signOut();
  window.location.replace('login.html');
}

// ─── Role-based visibility ────────────────────────────────────────────────────

function _applyRoleVisibility() {
  if (!adminUser) return;
  if (adminUser.role !== 'super_admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
}

function _renderAdminMeta() {
  const nameEl = document.getElementById('adminName');
  const roleEl = document.getElementById('adminRole');
  if (nameEl) nameEl.textContent = adminUser.full_name || adminUser.email;
  if (roleEl) {
    roleEl.textContent = adminUser.role === 'super_admin' ? 'Super Admin' : 'Staff Outlet';
    roleEl.style.color = adminUser.role === 'super_admin' ? 'var(--brand)' : 'var(--blue)';
  }
  // Sidebar name/role (tablet & desktop)
  const sidebarName = document.getElementById('sidebarName');
  const sidebarRole = document.getElementById('sidebarRole');
  if (sidebarName) sidebarName.textContent = adminUser.full_name || adminUser.email;
  if (sidebarRole) sidebarRole.textContent = adminUser.role === 'super_admin' ? 'Super Admin' : 'Staff Outlet';
}

// ─── Format ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
    + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function fmtTimeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 1)  return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return fmtDate(iso);
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS = {
  pending_payment: 'Menunggu Bayar',
  paid:            'Dikonfirmasi',
  preparing:       'Disiapkan',
  ready:           'Siap Ambil',
  done:            'Selesai',
  cancelled:       'Batal',
  expired:         'Kedaluwarsa',
};

const STATUS_COLORS = {
  pending_payment: '#f59e0b',
  paid:            '#3b82f6',
  preparing:       '#8b5cf6',
  ready:           '#10b981',
  done:            '#6b7280',
  cancelled:       '#ef4444',
  expired:         '#9ca3af',
};

const STATUS_NEXT_ACTION = {
  paid:      { label: '👨‍🍳 Proses', next: 'preparing' },
  preparing: { label: '✅ Siap Diambil', next: 'ready' },
  ready:     { label: '🎉 Selesai', next: 'done' },
};

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  const color = STATUS_COLORS[status] || '#9ca3af';
  return `<span style="background:${color}20;color:${color};font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap">${label}</span>`;
}

// ─── Notification sound ───────────────────────────────────────────────────────

let _audioCtx = null;

// Browser blokir AudioContext sebelum ada interaksi user — unlock saat pertama klik/tap
function _unlockAudio() {
  if (_audioCtx) return;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Resume jika suspended (Safari)
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
  } catch (e) {}
}
document.addEventListener('click',     _unlockAudio, { once: false, passive: true });
document.addEventListener('touchstart', _unlockAudio, { once: false, passive: true });
document.addEventListener('keydown',    _unlockAudio, { once: false, passive: true });

function playDing() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const osc  = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, _audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, _audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.5);
    osc.start();
    osc.stop(_audioCtx.currentTime + 0.5);
  } catch (e) { /* audio tidak tersedia */ }
}

// ─── Realtime channel registry ────────────────────────────────────────────────

const _channels = [];

function addRealtimeChannel(ch) {
  _channels.push(ch);
  return ch;
}

function cleanupChannels() {
  _channels.forEach(ch => { try { window.db.removeChannel(ch); } catch {} });
  _channels.length = 0;
}

window.addEventListener('beforeunload', cleanupChannels);

// ─── Order Notifications (berjalan di semua halaman admin) ───────────────────

const _ACTIVE_STATUSES_NOTIF = ['pending_payment', 'paid', 'preparing', 'ready'];

async function startOrderNotifications(user) {
  // Refresh badge awal
  await _refreshNavBadge(user);

  const outletFilter = (user.role === 'outlet_staff' && user.outlet_id)
    ? `outlet_id=eq.${user.outlet_id}` : undefined;

  const ch = window.db.channel('admin-notif-global')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'orders',
      ...(outletFilter ? { filter: outletFilter } : {}),
    }, async (payload) => {
      const { data: order } = await window.db
        .from('orders')
        .select('id, order_number, customer_name, total, outlets(name)')
        .eq('id', payload.new.id)
        .single();
      if (order) _onNewOrder(order, user);
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      ...(outletFilter ? { filter: outletFilter } : {}),
    }, (payload) => {
      // Refresh badge setiap ada perubahan status
      _refreshNavBadge(user);
    })
    .subscribe();

  addRealtimeChannel(ch);
}

async function _refreshNavBadge(user) {
  let q = window.db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .in('status', _ACTIVE_STATUSES_NOTIF);
  if (user.role === 'outlet_staff' && user.outlet_id) {
    q = q.eq('outlet_id', user.outlet_id);
  }
  const { count } = await q;
  _updateNavBadge(count || 0);
}

function _updateNavBadge(count) {
  document.querySelectorAll(
    '.admin-nav a[href*="orders.html"], .admin-sidebar-nav a[href*="orders.html"]'
  ).forEach(a => {
    let badge = a.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        const iconSpan = a.querySelector('span:first-child');
        if (iconSpan) {
          iconSpan.style.position = 'relative';
          iconSpan.style.display = 'inline-block';
          iconSpan.appendChild(badge);
        }
      }
      badge.textContent = count > 99 ? '99+' : String(count);
    } else {
      badge?.remove();
    }
  });
}

function _onNewOrder(order, user) {
  playDing();
  _refreshNavBadge(user);
  // Jika sedang di halaman orders — list sudah auto-refresh via subscribeOrders(), skip banner
  if (location.pathname.endsWith('orders.html')) return;
  const outletName = (order.outlets || {}).name || '';
  _showOrderNotifBanner(
    `🆕 Pesanan baru — <b>${escHtml(order.customer_name)}</b>`,
    `${order.order_number}${outletName ? ' · ' + escHtml(outletName) : ''} · ${formatRupiah(order.total)}`
  );
}

function _showOrderNotifBanner(msgHtml, subText) {
  let el = document.getElementById('orderNotifBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'orderNotifBanner';
    el.className = 'order-notif-banner';
    (document.querySelector('.phone') || document.body).appendChild(el);
  }
  el.innerHTML = `
    <div class="order-notif-inner">
      <div style="flex:1;min-width:0">
        <div class="order-notif-msg">${msgHtml}</div>
        <div class="order-notif-sub">${subText}</div>
      </div>
      <a href="/admin/orders.html" class="order-notif-action">Lihat →</a>
      <button onclick="this.closest('.order-notif-banner').classList.remove('show')" class="order-notif-x">×</button>
    </div>`;
  el.classList.remove('show');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('show'), 10000);
}

// ─── Admin modal (bottom sheet) ───────────────────────────────────────────────

function openModal(title, bodyHtml, footerHtml = '') {
  let overlay = document.getElementById('adminModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'adminModal';
    overlay.className = 'admin-modal-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="admin-modal-card">
      <div class="admin-modal-header">
        <span style="font-weight:700;font-size:15px">${title}</span>
        <button onclick="closeModal()" class="sheet-close">×</button>
      </div>
      <div class="admin-modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="admin-modal-footer">${footerHtml}</div>` : ''}
    </div>`;
  overlay.style.display = 'flex';
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };
}

function closeModal() {
  const m = document.getElementById('adminModal');
  if (m) m.style.display = 'none';
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function adminToast(msg, ms = 3000) {
  if (typeof showToast === 'function') { showToast(msg, ms); return; }
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), ms);
}

// ─── Update order status ──────────────────────────────────────────────────────

async function updateOrderStatus(orderId, newStatus) {
  const patch = { status: newStatus, updated_at: new Date().toISOString() };
  if (newStatus === 'done')      patch.done_at      = new Date().toISOString();
  if (newStatus === 'ready')     patch.ready_at     = new Date().toISOString();
  if (newStatus === 'cancelled') patch.cancelled_at = new Date().toISOString();

  const { error } = await window.db
    .from('orders')
    .update(patch)
    .eq('id', orderId);

  if (error) throw error;
}

// ─── Highlight nav link aktif ─────────────────────────────────────────────────

function setActiveNav() {
  const curr = location.pathname.split('/').pop() || 'index.html';
  // Tandai link aktif di bottom nav DAN sidebar
  document.querySelectorAll('.admin-nav a, .admin-sidebar-nav a').forEach(a => {
    const hrefPage = (a.getAttribute('href') || '').split('/').pop();
    a.classList.toggle('active', hrefPage === curr);
  });
}

document.addEventListener('DOMContentLoaded', setActiveNav);
