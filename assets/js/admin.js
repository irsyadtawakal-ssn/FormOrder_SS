// assets/js/admin.js — Shared admin utilities
// Dimuat setelah supabase.js + utils.js di semua halaman admin

// ─── State ────────────────────────────────────────────────────────────────────
let adminUser = null; // { id, email, full_name, role, outlet_id, is_active }

// Pre-apply visibility synchronously from cache to avoid UI flash/jumping
const cachedRole = localStorage.getItem('suka_admin_role');
if (cachedRole === 'super_admin') {
  document.body.classList.add('is-super-admin');
}

// Mencegah kedipan (flicker) menu super admin saat pertama kali load
(function() {
  if (typeof document !== 'undefined' && document.head) {
    const style = document.createElement('style');
    style.textContent = `
      .admin-only { display: none !important; }
      body.is-super-admin .admin-only.flex { display: flex !important; }
      body.is-super-admin .admin-only:not(.flex) { display: block !important; }
    `;
    document.head.appendChild(style);
  }
})();

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function requireAuth() {
  try {
    if (!window.db) {
      throw new Error('Supabase client belum siap (window.db undefined). Periksa koneksi internet dan pastikan CDN terload.');
    }
    const { data: { user }, error: authErr } = await window.db.auth.getUser();
    if (authErr || !user) {
      window.location.replace('login.html');
      return null;
    }

    const { data: profile, error } = await window.db
      .from('admin_users')
      .select('id, full_name, role, outlet_id, is_active')
      .eq('id', user.id)
      .single();

    if (error || !profile || !profile.is_active) {
      localStorage.removeItem('suka_admin_role');
      await window.db.auth.signOut();
      window.location.replace('login.html');
      return null;
    }

    localStorage.setItem('suka_admin_role', profile.role);
    adminUser = { ...profile, email: user.email };
    _applyRoleVisibility();
    _renderAdminMeta();
    startOrderNotifications(adminUser); // mulai notif realtime di semua halaman
    return adminUser;
  } catch (err) {
    console.error("Auth Error:", err);
    alert("Sesi bermasalah atau koneksi terputus. Silakan login kembali.");
    window.location.replace('login.html');
    return null;
  }
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
  localStorage.removeItem('suka_admin_role');
  await window.db.auth.signOut();
  window.location.replace('login.html');
}

// ─── Role-based visibility ────────────────────────────────────────────────────

function _applyRoleVisibility() {
  if (!adminUser) return;
  if (adminUser.role === 'super_admin') {
    document.body.classList.add('is-super-admin');
    
    // Force override to ensure elements show up (handles edge cases/caching)
    let style = document.getElementById('force-admin-visibility');
    if (!style) {
      style = document.createElement('style');
      style.id = 'force-admin-visibility';
      style.textContent = `
        body.is-super-admin .admin-only.flex {
          display: flex !important;
        }
        body.is-super-admin .admin-only:not(.flex) {
          display: inline-block !important;
        }
      `;
      document.head.appendChild(style);
    }
    
    document.querySelectorAll('.admin-only').forEach(el => {
      if (el.style.display === 'none') el.style.display = '';
    });
  } else {
    document.body.classList.remove('is-super-admin');
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
}

function _renderAdminMeta() {
  const nameEl = document.getElementById('adminName');
  const nameElMobile = document.getElementById('adminNameMobile');
  const roleEl = document.getElementById('adminRole');
  const roleElMobile = document.getElementById('adminRoleMobile');
  
  const name = adminUser.full_name || adminUser.email;
  const role = adminUser.role === 'super_admin' ? 'Super Admin' : 'Staff Outlet';
  
  if (nameEl) nameEl.textContent = name;
  if (nameElMobile) nameElMobile.textContent = name;
  
  if (roleEl) {
    roleEl.textContent = role;
  }
  if (roleElMobile) {
    roleElMobile.textContent = role;
  }
  
  // Sidebar name/role (tablet & desktop)
  const sidebarName = document.getElementById('sidebarName');
  const sidebarRole = document.getElementById('sidebarRole');
  if (sidebarName) sidebarName.textContent = name;
  if (sidebarRole) sidebarRole.textContent = role;
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
  paid:      { label: '<i data-lucide="chef-hat" class="w-4 h-4 inline"></i> Proses', next: 'preparing' },
  preparing: { label: '<i data-lucide="check-circle" class="w-4 h-4 inline"></i> Siap Diambil', next: 'ready' },
  ready:     { label: '<i data-lucide="party-popper" class="w-4 h-4 inline"></i> Selesai', next: 'done' },
};

function statusBadge(status) {
  const map = {
    'unpaid': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Belum Bayar' },
    'paid': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Dibayar' },
    'preparing': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Disiapkan' },
    'ready': { bg: 'bg-green-100', text: 'text-green-700', label: 'Siap Ambil' },
    'done': { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Selesai' },
    'cancelled': { bg: 'bg-red-100', text: 'text-red-700', label: 'Batal' }
  };
  const m = map[status] || map.unpaid;
  return `<span class="px-2 py-1 rounded-full text-[10px] font-bold ${m.bg} ${m.text}">${m.label}</span>`;
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setActiveNav);
} else {
  setActiveNav();
}

// ─── Custom select (dropdown design system SUKA) ──────────────────────────────
// Semua <select> di halaman admin otomatis diganti tampilannya dengan dropdown
// custom. <select> asli tetap ada (disembunyikan) sebagai sumber nilai, jadi kode
// lama yang membaca .value, mengisi <option>, atau memakai onchange tetap jalan.
// Search bar otomatis muncul bila jumlah opsi lebih dari 5.
// Opt-out: tambahkan atribut data-native pada <select>.

const CSELECT_SEARCH_THRESHOLD = 5; // tampilkan search bila opsi > 5
const _cselValueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const _cselIndexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
let _cselOpen = null; // instance dropdown yang sedang terbuka

const _CSEL_ICON_CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const _CSEL_ICON_SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
const _CSEL_ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function _cselNorm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function enhanceSelect(sel) {
  if (sel._csel || sel.multiple || sel.hasAttribute('data-native')) return;

  const wrap = document.createElement('div');
  wrap.className = 'cselect';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `<span class="cselect-label"></span><span class="cselect-chevron">${_CSEL_ICON_CHEVRON}</span>`;
  const label = trigger.firstElementChild;

  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(trigger);
  wrap.appendChild(sel);
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');

  let panel = null, list = null, search = null, empty = null, activeEl = null;

  const inst = { sel, wrap, trigger };
  sel._csel = inst;

  // Salin class & status dari <select> asli ke tombol trigger
  function syncAttrs() {
    const cls = (sel.getAttribute('class') || '').split(/\s+/).filter(c => c && c !== 'cselect-native');
    // .admin-only mengatur display (pakai !important) — pasang di wrapper, bukan di trigger
    const adminOnly = cls.includes('admin-only');
    wrap.classList.toggle('admin-only', adminOnly);
    const triggerCls = cls.filter(c => c !== 'admin-only');
    trigger.className = [...triggerCls, 'cselect-trigger'].join(' ');
    if (!triggerCls.length) trigger.classList.add('form-input');
    if (!sel.classList.contains('cselect-native')) sel.classList.add('cselect-native');
    trigger.disabled = sel.disabled;
    wrap.style.display = (sel.hidden || sel.style.display === 'none') ? 'none' : '';
    if (sel.disabled && _cselOpen === inst) close();
  }

  function renderLabel() {
    const opt = sel.options[_cselIndexDesc.get.call(sel)];
    label.textContent = opt ? opt.textContent : '';
  }

  function refresh() {
    renderLabel();
    if (_cselOpen === inst) buildList();
  }

  // Tangkap perubahan nilai secara programatik (sel.value = x / sel.selectedIndex = n)
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get() { return _cselValueDesc.get.call(this); },
    set(v) { _cselValueDesc.set.call(this, v); renderLabel(); },
  });
  Object.defineProperty(sel, 'selectedIndex', {
    configurable: true,
    get() { return _cselIndexDesc.get.call(this); },
    set(v) { _cselIndexDesc.set.call(this, v); renderLabel(); },
  });

  new MutationObserver(refresh).observe(sel, { childList: true, subtree: true, characterData: true });
  new MutationObserver(syncAttrs).observe(sel, { attributes: true, attributeFilter: ['class', 'style', 'disabled', 'hidden'] });
  sel.addEventListener('change', renderLabel);
  sel.form?.addEventListener('reset', () => setTimeout(renderLabel));

  function buildList() {
    list.innerHTML = '';
    const current = _cselIndexDesc.get.call(sel);
    let lastGroup = null;
    Array.from(sel.options).forEach((opt, i) => {
      const grp = opt.parentElement.tagName === 'OPTGROUP' ? opt.parentElement : null;
      if (grp && grp !== lastGroup) {
        const h = document.createElement('div');
        h.className = 'cselect-group';
        h.textContent = grp.label;
        list.appendChild(h);
      }
      lastGroup = grp;
      if (opt.hidden) return;
      const el = document.createElement('div');
      el.className = 'cselect-option';
      el.setAttribute('role', 'option');
      el.dataset.i = i;
      el._text = _cselNorm(opt.textContent);
      if (opt.disabled || (grp && grp.disabled)) el.classList.add('is-disabled');
      el.setAttribute('aria-selected', i === current ? 'true' : 'false');
      el.innerHTML = `<span class="cselect-option-text"></span><span class="cselect-check">${_CSEL_ICON_CHECK}</span>`;
      el.firstElementChild.textContent = opt.textContent;
      list.appendChild(el);
    });
    applyFilter();
  }

  function visibleOptions() {
    return Array.from(list.querySelectorAll('.cselect-option:not(.is-hidden):not(.is-disabled)'));
  }

  function setActive(el, scroll = true) {
    activeEl?.classList.remove('is-active');
    activeEl = el || null;
    if (!activeEl) return;
    activeEl.classList.add('is-active');
    if (scroll) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function applyFilter() {
    const q = search ? _cselNorm(search.value) : '';
    let any = false;
    list.querySelectorAll('.cselect-option').forEach(el => {
      const hit = !q || el._text.includes(q);
      el.classList.toggle('is-hidden', !hit);
      if (hit) any = true;
    });
    list.querySelectorAll('.cselect-group').forEach(h => h.classList.toggle('is-hidden', !!q));
    empty.style.display = any ? 'none' : '';
    const vis = visibleOptions();
    const selected = vis.find(el => el.getAttribute('aria-selected') === 'true');
    setActive(q ? vis[0] : (selected || vis[0]));
  }

  function position() {
    if (!panel) return;
    if (!wrap.isConnected) { close(); return; }
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, gap = 6, margin = 8;
    const width = Math.min(Math.max(r.width, 220), vw - margin * 2);
    const left = Math.max(margin, Math.min(r.left, vw - width - margin));
    const below = vh - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const wanted = Math.min(360, panel.scrollHeight);
    const up = below < wanted && above > below;
    panel.style.width = width + 'px';
    panel.style.left = left + 'px';
    panel.style.maxHeight = Math.max(140, Math.min(360, up ? above : below)) + 'px';
    if (up) {
      panel.style.top = '';
      panel.style.bottom = (vh - r.top + gap) + 'px';
    } else {
      panel.style.bottom = '';
      panel.style.top = (r.bottom + gap) + 'px';
    }
  }

  function choose(el) {
    if (!el || el.classList.contains('is-disabled')) return;
    const i = Number(el.dataset.i);
    const changed = _cselIndexDesc.get.call(sel) !== i;
    _cselIndexDesc.set.call(sel, i);
    renderLabel();
    close();
    trigger.focus();
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function onKey(e) {
    const vis = visibleOptions();
    const idx = vis.indexOf(activeEl);
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(vis[Math.min(idx + 1, vis.length - 1)] || vis[0]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(vis[Math.max(idx - 1, 0)]); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(activeEl); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
    else if (e.key === 'Tab') { close(); }
  }

  function open(initialQuery = '') {
    if (_cselOpen === inst || sel.disabled) return;
    _cselOpen?.close();
    _cselOpen = inst;

    const withSearch = sel.options.length > CSELECT_SEARCH_THRESHOLD;
    panel = document.createElement('div');
    panel.className = 'cselect-panel';
    panel.tabIndex = -1;
    panel.innerHTML = (withSearch
      ? `<div class="cselect-search">${_CSEL_ICON_SEARCH}<input type="text" placeholder="Cari..." autocomplete="off" spellcheck="false" /></div>`
      : '') +
      '<div class="cselect-list" role="listbox"></div><div class="cselect-empty" style="display:none">Tidak ditemukan</div>';
    search = panel.querySelector('.cselect-search input');
    list = panel.querySelector('.cselect-list');
    empty = panel.querySelector('.cselect-empty');
    if (search) {
      search.value = initialQuery;
      search.addEventListener('input', applyFilter);
    }
    panel.addEventListener('keydown', onKey);
    panel.addEventListener('mousemove', e => {
      const el = e.target.closest('.cselect-option');
      if (el && el !== activeEl && !el.classList.contains('is-disabled')) setActive(el, false);
    });
    panel.addEventListener('click', e => choose(e.target.closest('.cselect-option')));

    document.body.appendChild(panel);
    buildList();
    position();
    activeEl?.scrollIntoView({ block: 'nearest' });

    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('is-open');

    // Di perangkat sentuh jangan langsung munculkan keyboard kecuali user sudah mengetik
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    if (search && (finePointer || initialQuery)) search.focus({ preventScroll: true });
    else panel.focus({ preventScroll: true });
  }

  function close() {
    if (_cselOpen !== inst) return;
    _cselOpen = null;
    panel?.remove();
    panel = list = search = empty = activeEl = null;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('is-open');
  }

  Object.assign(inst, { open, close, refresh, position, panelContains: n => !!panel && panel.contains(n) });

  trigger.addEventListener('click', () => (_cselOpen === inst ? close() : open()));
  trigger.addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      open();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
               && sel.options.length > CSELECT_SEARCH_THRESHOLD) {
      // Mulai mengetik langsung membuka dropdown + mengisi search
      e.preventDefault();
      open(e.key);
    }
  });

  syncAttrs();
  renderLabel();
  return inst;
}

function enhanceSelects(root = document) {
  if (root.tagName === 'SELECT') { enhanceSelect(root); return; }
  root.querySelectorAll?.('select').forEach(enhanceSelect);
}

function _initCustomSelects() {
  enhanceSelects(document);

  // Select yang dirender belakangan (modal, list dinamis) ikut di-enhance
  new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(n => { if (n.nodeType === 1) enhanceSelects(n); });
    }
    if (_cselOpen && !_cselOpen.wrap.isConnected) _cselOpen.close();
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('pointerdown', e => {
    if (_cselOpen && !_cselOpen.wrap.contains(e.target) && !_cselOpen.panelContains(e.target)) {
      _cselOpen.close();
    }
  }, true);
  window.addEventListener('scroll', e => {
    if (_cselOpen && !_cselOpen.panelContains(e.target)) _cselOpen.position();
  }, true);
  window.addEventListener('resize', () => _cselOpen?.position());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initCustomSelects);
} else {
  _initCustomSelects();
}
