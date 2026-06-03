// SUKA Shawarma — utility functions (shared semua halaman)

// ─── HTML Escaping — wajib dipakai sebelum interpolasi ke innerHTML ────────────
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Currency ─────────────────────────────────────────────────────────────────

function formatRupiah(n) {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

// ─── WhatsApp number ──────────────────────────────────────────────────────────

function validateWA(s) {
  const cleaned = s.replace(/[\s\-().]/g, '');
  return /^(\+?62|0)8\d{8,12}$/.test(cleaned);
}

// Normalisasi ke format 628xxx (tanpa +)
function normalizeWA(s) {
  s = s.replace(/[\s\-().]/g, '');
  if (s.startsWith('+62')) return '62' + s.slice(3);
  if (s.startsWith('62'))  return s;
  if (s.startsWith('0'))   return '62' + s.slice(1);
  return s;
}

// ─── Geolocation / distance ───────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km < 1) return Math.round(km * 1000) + ' m';
  return km.toFixed(1) + ' km';
}

// ─── Cart localStorage ────────────────────────────────────────────────────────
// Format item: { menuItemId, name, unitPrice, qty, selections, note }

const CART_PREFIX = 'suka_cart_';

function getCart(outletSlug) {
  try {
    return JSON.parse(localStorage.getItem(CART_PREFIX + outletSlug) || '[]');
  } catch {
    return [];
  }
}

function setCart(outletSlug, items) {
  localStorage.setItem(CART_PREFIX + outletSlug, JSON.stringify(items));
}

function clearCart(outletSlug) {
  localStorage.removeItem(CART_PREFIX + outletSlug);
}

function getCartTotal(items) {
  return items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
}

function getCartCount(items) {
  return items.reduce((s, i) => s + i.qty, 0);
}

// Ringkasan teks pilihan varian (untuk tampilan cart)
function summarizeSelections(selections) {
  return Object.values(selections)
    .filter(v => (Array.isArray(v) ? v.length > 0 : v))
    .map(v => Array.isArray(v) ? v.join(', ') : v)
    .join(' · ');
}

// ─── Outlet open/closed ───────────────────────────────────────────────────────

function isOutletOpen(openHour, closeHour) {
  if (!openHour || !closeHour) return true;
  const now      = new Date();
  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = openHour.split(':').map(Number);
  const [ch, cm] = closeHour.split(':').map(Number);
  const openMin  = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  if (openMin <= closeMin) return nowMin >= openMin && nowMin < closeMin;
  return nowMin >= openMin || nowMin < closeMin; // melewati tengah malam
}

function formatHour(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  return h + '.' + m;
}

// ─── Kota dari alamat ─────────────────────────────────────────────────────────

function extractKota(address) {
  // Ambil bagian penultimate dari "Jl. X, Kelurahan, Kota, Provinsi"
  const parts = address.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || '';
}

// ─── Debounce ─────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ─── Toast notification ───────────────────────────────────────────────────────

let _toastTimer;
function showToast(msg, duration = 2000) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─── Countdown timer ──────────────────────────────────────────────────────────

function startCountdown(expiresAt, onTick, onExpire) {
  function tick() {
    const ms = new Date(expiresAt) - Date.now();
    if (ms <= 0) { onExpire(); return; }
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    onTick(m, s);
    setTimeout(tick, 1000);
  }
  tick();
}

// ─── URL params ───────────────────────────────────────────────────────────────

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
