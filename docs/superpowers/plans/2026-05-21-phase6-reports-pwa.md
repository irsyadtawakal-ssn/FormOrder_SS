# Phase 6 — Reports & PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halaman laporan admin (revenue, grafik, podium top-3 menu, tabel detail per item/hari) + export CSV client-side + PWA installable (manifest + SW + icon) + print CSS struk.

**Architecture:** Semua kalkulasi di client-side — query `orders JOIN order_items` ke Supabase, RLS enforce outlet scope otomatis. Chart.js dari CDN untuk bar chart harian. Service Worker cache-first untuk shell, network-first untuk API.

**Tech Stack:** Vanilla HTML/CSS/JS, Supabase JS SDK (CDN), Chart.js 4.x (CDN), Service Worker API

---

## File Map

| File | Action | Keterangan |
|------|--------|-----------|
| `admin/reports.html` | Create | Halaman utama reports |
| `sw.js` | Create | Service Worker — cache shell + offline fallback |
| `assets/img/icon.svg` | Create | PWA icon placeholder (SVG, diganti owner nanti) |
| `manifest.json` | Modify | Perbaiki background_color + gunakan SVG icon |
| `assets/css/style.css` | Modify | Tambah styles report + print CSS |
| `admin/index.html` | Modify | Tambah link manifest + SW registration + nav Reports |
| `admin/orders.html` | Modify | Sama seperti index.html |
| `admin/menu.html` | Modify | Sama seperti index.html |
| `admin/outlets.html` | Modify | Sama seperti index.html |
| `admin/settings.html` | Modify | Sama seperti index.html |
| `admin/users.html` | Modify | Sama seperti index.html |
| `index.html` | Modify | Tambah link manifest + SW registration (halaman publik) |
| `checkout.html` | Modify | Sama seperti index.html |
| `order.html` | Modify | Sama seperti index.html |
| `Plans.md` | Modify | Tandai 6.1–6.4 selesai saat tiap task kelar |

---

## Task 1: PWA Icon + Manifest

**Files:**
- Create: `assets/img/icon.svg`
- Modify: `manifest.json`

- [ ] **Step 1: Buat SVG icon placeholder**

Buat file `assets/img/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#ff4d4f"/>
  <text x="256" y="340" font-family="-apple-system,sans-serif" font-size="320" font-weight="800"
        text-anchor="middle" fill="#ffffff">S</text>
</svg>
```

- [ ] **Step 2: Update manifest.json**

Ganti isi `manifest.json` menjadi:

```json
{
  "name": "SUKA Shawarma Order",
  "short_name": "SUKA Order",
  "description": "Pesan shawarma online, pickup di outlet terdekat.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0f0f",
  "theme_color": "#ff4d4f",
  "orientation": "portrait",
  "icons": [
    {
      "src": "assets/img/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "Pilih Outlet",
      "url": "/",
      "description": "Pilih outlet SUKA Shawarma terdekat"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add assets/img/icon.svg manifest.json
git commit -m "feat(pwa): icon SVG placeholder + update manifest"
```

---

## Task 2: Service Worker (sw.js)

**Files:**
- Create: `sw.js`

- [ ] **Step 1: Buat sw.js di root**

Buat file `sw.js`:

```js
// Service Worker — SUKA Shawarma
const CACHE = 'suka-v1';

// File shell yang di-cache (cache-first)
const SHELL = [
  '/',
  '/index.html',
  '/menu.html',
  '/checkout.html',
  '/order.html',
  '/admin/index.html',
  '/admin/login.html',
  '/admin/orders.html',
  '/admin/menu.html',
  '/admin/outlets.html',
  '/admin/settings.html',
  '/admin/users.html',
  '/admin/reports.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/assets/js/admin.js',
  '/assets/js/supabase.js',
  '/assets/js/utils.js',
  '/assets/img/icon.svg',
  '/manifest.json',
];

// Install — cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Activate — hapus cache lama
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — strategi per tipe request
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Jangan cache request ke Supabase / API eksternal
  if (url.hostname.includes('supabase') || url.hostname.includes('cdn.jsdelivr')) {
    return; // biarkan browser handle (network)
  }

  // Cache-first untuk shell
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).catch(() => offlineFallback(e.request));
    })
  );
});

function offlineFallback(req) {
  // Untuk navigasi HTML, kembalikan halaman offline
  if (req.destination === 'document') {
    return new Response(`
      <!doctype html>
      <html lang="id">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Tidak Ada Koneksi</title>
        <style>
          body { font-family: -apple-system,sans-serif; display:flex; align-items:center;
                 justify-content:center; min-height:100vh; margin:0; background:#fafafa; }
          .box { text-align:center; padding:32px; }
          .icon { font-size:64px; margin-bottom:16px; }
          h2 { color:#111; margin:0 0 8px; }
          p { color:#666; margin:0; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="icon">📡</div>
          <h2>Tidak Ada Koneksi</h2>
          <p>Cek internet kamu dan coba lagi.</p>
        </div>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }
  return new Response('', { status: 503 });
}
```

- [ ] **Step 2: Commit**

```bash
git add sw.js
git commit -m "feat(pwa): service worker cache-first + offline fallback"
```

---

## Task 3: Tambah Manifest + SW ke Semua Halaman

**Files:**
- Modify: `index.html`, `checkout.html`, `order.html`, `admin/index.html`, `admin/orders.html`, `admin/menu.html`, `admin/outlets.html`, `admin/settings.html`, `admin/users.html`, `admin/login.html`

- [ ] **Step 1: Tambah ke `<head>` semua halaman**

Di setiap file HTML, di dalam `<head>`, tambahkan setelah `<meta name="viewport"...>`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#ff4d4f" />
```

Untuk file di folder `admin/`, path manifest tetap `/manifest.json` (absolute path dari root domain).

- [ ] **Step 2: Tambah registrasi SW sebelum `</body>` semua halaman**

Di setiap file HTML, tambahkan tepat sebelum tag `</body>` penutup (sebelum script lain yang ada):

```html
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');</script>
```

- [ ] **Step 3: Commit**

```bash
git add index.html checkout.html order.html admin/index.html admin/orders.html admin/menu.html admin/outlets.html admin/settings.html admin/users.html admin/login.html
git commit -m "feat(pwa): tambah manifest link + SW registration ke semua halaman"
```

---

## Task 4: Tambah Nav Reports + Report Styles

**Files:**
- Modify: semua admin HTML yang punya `<nav class="admin-nav">` (semua kecuali `admin/login.html`)
- Modify: `assets/css/style.css`

- [ ] **Step 1: Tambah link Reports di bottom nav semua admin HTML**

Di setiap file admin HTML (index, orders, menu, outlets, settings, users, reports), cari blok `<nav class="admin-nav">` dan tambahkan link Reports. Nav yang sudah ada:

```html
<a href="/admin/index.html"><span>🏠</span><span>Dashboard</span></a>
<a href="/admin/orders.html"><span>📋</span><span>Pesanan</span></a>
<a href="/admin/menu.html"><span>🌯</span><span>Menu</span></a>
<a href="/admin/outlets.html" class="admin-only"><span>📍</span><span>Outlet</span></a>
<a href="/admin/settings.html" class="admin-only"><span>⚙️</span><span>Pengaturan</span></a>
```

Tambahkan link Reports di antara Menu dan Outlet:

```html
<a href="/admin/index.html"><span>🏠</span><span>Dashboard</span></a>
<a href="/admin/orders.html"><span>📋</span><span>Pesanan</span></a>
<a href="/admin/menu.html"><span>🌯</span><span>Menu</span></a>
<a href="/admin/reports.html"><span>📊</span><span>Laporan</span></a>
<a href="/admin/outlets.html" class="admin-only"><span>📍</span><span>Outlet</span></a>
<a href="/admin/settings.html" class="admin-only"><span>⚙️</span><span>Pengaturan</span></a>
```

- [ ] **Step 2: Tambah styles report + print CSS di style.css**

Tambahkan di akhir `assets/css/style.css`:

```css
/* ─── Report ─────────────────────────────────────────────────────────────── */
.report-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: var(--card);
  border-bottom: 1px solid var(--line);
}
.report-filters select,
.report-filters input[type="date"] {
  flex: 1;
  min-width: 120px;
  padding: 8px 10px;
  border: 1px solid var(--line2);
  border-radius: var(--radius-xs);
  font-size: 13px;
  background: var(--bg);
  color: var(--ink);
}
.report-filters button {
  padding: 8px 18px;
  background: var(--brand);
  color: #fff;
  border: 0;
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-weight: 700;
}
.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
}
.metric-card {
  background: var(--card);
  border-radius: var(--radius-sm);
  padding: 14px 12px;
  box-shadow: var(--shadow);
}
.metric-card .metric-label {
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.metric-card .metric-value {
  font-size: 20px;
  font-weight: 800;
  color: var(--ink);
  margin: 4px 0 2px;
  line-height: 1.2;
}
.metric-card .metric-growth {
  font-size: 12px;
  font-weight: 600;
}
.metric-card .metric-growth.up   { color: var(--green); }
.metric-card .metric-growth.down { color: var(--brand); }
.metric-card .metric-growth.flat { color: var(--muted); }

.chart-wrap {
  margin: 0 12px 12px;
  background: var(--card);
  border-radius: var(--radius-sm);
  padding: 14px 12px;
  box-shadow: var(--shadow);
}
.chart-wrap h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink2);
  margin: 0 0 12px;
}

/* Podium top-3 */
.podium {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
  align-items: flex-end;
}
.podium-card {
  flex: 1;
  background: var(--card);
  border-radius: var(--radius-sm);
  padding: 12px 8px;
  text-align: center;
  box-shadow: var(--shadow);
  position: relative;
}
.podium-card.rank-1 { border: 2px solid #f59e0b; }
.podium-card .podium-rank { font-size: 22px; line-height: 1; margin-bottom: 6px; }
.podium-card .podium-name { font-size: 12px; font-weight: 700; color: var(--ink); line-height: 1.3; margin-bottom: 4px; }
.podium-card .podium-qty  { font-size: 18px; font-weight: 800; color: var(--brand); }
.podium-card .podium-sub  { font-size: 10px; color: var(--muted); }

/* Tabel detail */
.report-table-wrap {
  margin: 0 12px 12px;
  background: var(--card);
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: var(--shadow);
}
.report-table-wrap h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink2);
  margin: 0;
  padding: 12px 12px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.report-table-wrap h3 button {
  font-size: 11px;
  font-weight: 700;
  padding: 5px 12px;
  background: var(--green-bg);
  color: var(--green);
  border: 0;
  border-radius: var(--radius-xs);
}
.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.report-table th {
  background: var(--bg);
  padding: 8px 10px;
  text-align: left;
  font-weight: 700;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .4px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.report-table th:hover { color: var(--ink); }
.report-table th .sort-icon { margin-left: 4px; opacity: .5; }
.report-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
  color: var(--ink2);
  vertical-align: top;
}
.report-table tr:last-child td { border-bottom: 0; }
.report-table tr:hover td { background: var(--brand-bg); }
.report-empty {
  padding: 32px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

/* ─── Print (struk order) ─────────────────────────────────────────────────── */
@media print {
  body { background: #fff; }
  .phone { max-width: 100%; padding-bottom: 0; }
  .topbar, .admin-nav, .chips, .btn, button,
  .report-filters, .chart-wrap, .podium,
  [style*="cursor:pointer"] { display: none !important; }
  .report-table-wrap h3 button { display: none !important; }
  .report-table { font-size: 11px; }
  .metric-card { box-shadow: none; border: 1px solid #ddd; }
}
```

- [ ] **Step 3: Commit**

```bash
git add assets/css/style.css admin/index.html admin/orders.html admin/menu.html admin/outlets.html admin/settings.html admin/users.html
git commit -m "feat(reports): nav laporan + styles report + print CSS"
```

---

## Task 5: Halaman Reports (`admin/reports.html`)

**Files:**
- Create: `admin/reports.html`

- [ ] **Step 1: Buat admin/reports.html**

Buat file `admin/reports.html`:

```html
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Laporan — SUKA Admin</title>
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#ff4d4f" />
<link rel="stylesheet" href="../assets/css/style.css" />
</head>
<body>
<div class="phone">

  <!-- Topbar -->
  <div class="topbar">
    <span class="topbar-title">📊 Laporan</span>
    <div style="display:flex;align-items:center;gap:8px">
      <span id="adminName" style="font-size:12px;color:var(--muted)"></span>
    </div>
  </div>

  <!-- Filter -->
  <div class="report-filters" id="filterBar">
    <select id="outletFilter" class="admin-only" style="display:none">
      <option value="">Semua Outlet</option>
    </select>
    <select id="rangePreset" onchange="onPresetChange()">
      <option value="today">Hari Ini</option>
      <option value="7d" selected>7 Hari</option>
      <option value="30d">30 Hari</option>
      <option value="custom">Custom</option>
    </select>
    <div id="customRange" style="display:none;flex:100%;display:none;gap:8px;flex-wrap:wrap">
      <input type="date" id="dateFrom" />
      <input type="date" id="dateTo" />
    </div>
    <button onclick="loadReport()">Terapkan</button>
  </div>

  <!-- Metrics -->
  <div class="metrics-grid" id="metricsGrid">
    <div class="metric-card"><div class="metric-label">Total Revenue</div><div class="metric-value skeleton-line" style="height:24px;width:80px"></div></div>
    <div class="metric-card"><div class="metric-label">Jumlah Order</div><div class="metric-value skeleton-line" style="height:24px;width:40px"></div></div>
    <div class="metric-card"><div class="metric-label">Rata-rata Order</div><div class="metric-value skeleton-line" style="height:24px;width:60px"></div></div>
    <div class="metric-card"><div class="metric-label">vs Periode Lalu</div><div class="metric-value skeleton-line" style="height:24px;width:50px"></div></div>
  </div>

  <!-- Chart -->
  <div class="chart-wrap">
    <h3>Revenue Harian</h3>
    <canvas id="revenueChart" height="160"></canvas>
  </div>

  <!-- Podium top-3 -->
  <div style="padding:0 12px 8px">
    <div style="font-size:13px;font-weight:700;color:var(--ink2);margin-bottom:8px">🏆 Menu Terlaris</div>
  </div>
  <div class="podium" id="podiumWrap">
    <div class="report-empty" style="flex:1">Memuat data...</div>
  </div>

  <!-- Tabel detail -->
  <div class="report-table-wrap">
    <h3>
      Detail Per Item
      <button onclick="exportCSV()">⬇ Export CSV</button>
    </h3>
    <div id="tableWrap"><div class="report-empty">Memuat data...</div></div>
  </div>

  <!-- Bottom nav -->
  <nav class="admin-nav">
    <a href="/admin/index.html"><span>🏠</span><span>Dashboard</span></a>
    <a href="/admin/orders.html"><span>📋</span><span>Pesanan</span></a>
    <a href="/admin/menu.html"><span>🌯</span><span>Menu</span></a>
    <a href="/admin/reports.html" class="active"><span>📊</span><span>Laporan</span></a>
    <a href="/admin/outlets.html" class="admin-only"><span>📍</span><span>Outlet</span></a>
    <a href="/admin/settings.html" class="admin-only"><span>⚙️</span><span>Pengaturan</span></a>
  </nav>

</div>
<div class="toast" id="toast"></div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="../config.js"></script>
<script src="../assets/js/supabase.js"></script>
<script src="../assets/js/utils.js"></script>
<script src="../assets/js/admin.js"></script>
<script src="../assets/js/reports.js"></script>
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');</script>
</body>
</html>
```

- [ ] **Step 2: Commit HTML**

```bash
git add admin/reports.html
git commit -m "feat(reports): tambah admin/reports.html"
```

---

## Task 6: Logic Reports (`assets/js/reports.js`)

**Files:**
- Create: `assets/js/reports.js`

- [ ] **Step 1: Buat assets/js/reports.js**

Buat file `assets/js/reports.js`:

```js
// assets/js/reports.js — Logic halaman laporan

let _user       = null; // adminUser dari admin.js
let _chartInst  = null; // instance Chart.js
let _rawData    = [];   // rows [{date, outlet_name, item_name, qty, unit_price}]
let _sortCol    = 'date';
let _sortAsc    = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

(async function init() {
  _user = await requireAuth();
  if (!_user) return;

  // Tampilkan outlet filter hanya untuk super_admin
  if (_user.role === 'super_admin') {
    await _populateOutletFilter();
    document.getElementById('outletFilter').style.display = 'block';
  }

  // Default: 7 hari terakhir
  _setDefaultDates();
  await loadReport();
})();

// ─── Date helpers ─────────────────────────────────────────────────────────────

function _setDefaultDates() {
  const to   = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6); // 7 hari inklusif
  document.getElementById('dateTo').value   = _toYmd(to);
  document.getElementById('dateFrom').value = _toYmd(from);
}

function _toYmd(d) {
  return d.toISOString().split('T')[0];
}

function _getActiveDates() {
  const preset = document.getElementById('rangePreset').value;
  const today  = new Date();
  let from, to;

  if (preset === 'today') {
    from = to = _toYmd(today);
  } else if (preset === '7d') {
    const f = new Date(); f.setDate(f.getDate() - 6);
    from = _toYmd(f); to = _toYmd(today);
  } else if (preset === '30d') {
    const f = new Date(); f.setDate(f.getDate() - 29);
    from = _toYmd(f); to = _toYmd(today);
  } else {
    from = document.getElementById('dateFrom').value;
    to   = document.getElementById('dateTo').value;
  }
  return { from, to };
}

// Hitung tanggal periode sebelumnya (panjang sama)
function _prevPeriod(from, to) {
  const msFrom = new Date(from).getTime();
  const msTo   = new Date(to).getTime();
  const len    = msTo - msFrom + 86400000; // inklusif
  const prevTo   = new Date(msFrom - 86400000);
  const prevFrom = new Date(msFrom - len);
  return { from: _toYmd(prevFrom), to: _toYmd(prevTo) };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function onPresetChange() {
  const val  = document.getElementById('rangePreset').value;
  const wrap = document.getElementById('customRange');
  wrap.style.display = val === 'custom' ? 'flex' : 'none';
}

async function _populateOutletFilter() {
  const { data } = await window.db
    .from('outlets')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (!data) return;
  const sel = document.getElementById('outletFilter');
  data.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id; opt.textContent = o.name;
    sel.appendChild(opt);
  });
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function _fetchRows(from, to, outletId) {
  let q = window.db
    .from('order_items')
    .select(`
      qty,
      unit_price,
      item_name,
      orders!inner(
        id,
        created_at,
        status,
        outlet_id,
        outlets(name)
      )
    `)
    .eq('orders.status', 'done')
    .gte('orders.created_at', from + 'T00:00:00+07:00')
    .lte('orders.created_at', to   + 'T23:59:59+07:00');

  if (outletId) q = q.eq('orders.outlet_id', outletId);

  const { data, error } = await q;
  if (error) { console.error('Fetch error:', error); return []; }

  return (data || []).map(row => ({
    order_id:    row.orders.id,
    date:        row.orders.created_at.split('T')[0],
    outlet_name: row.orders.outlets?.name || '—',
    item_name:   row.item_name,
    qty:         row.qty,
    unit_price:  row.unit_price,
    subtotal:    row.qty * row.unit_price,
  }));
}

// ─── Main load ────────────────────────────────────────────────────────────────

async function loadReport() {
  const { from, to }  = _getActiveDates();
  const outletId = _user.role === 'super_admin'
    ? document.getElementById('outletFilter').value
    : _user.outlet_id;

  // Tampilkan skeleton
  _renderMetricsSkeleton();
  document.getElementById('podiumWrap').innerHTML =
    '<div class="report-empty" style="flex:1">Memuat data...</div>';
  document.getElementById('tableWrap').innerHTML =
    '<div class="report-empty">Memuat data...</div>';

  // Fetch periode aktif + periode sebelumnya (untuk growth)
  const prev = _prevPeriod(from, to);
  const [rows, rowsPrev] = await Promise.all([
    _fetchRows(from, to, outletId),
    _fetchRows(prev.from, prev.to, outletId),
  ]);

  _rawData = rows;

  _renderMetrics(rows, rowsPrev);
  _renderChart(rows, from, to);
  _renderPodium(rows);
  _renderTable(rows);
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function _renderMetricsSkeleton() {
  document.getElementById('metricsGrid').innerHTML = `
    ${_metricCardHTML('Total Revenue',   '<div class="skeleton skeleton-line" style="height:24px;width:80px;margin:4px 0 2px"></div>', '')}
    ${_metricCardHTML('Jumlah Order',    '<div class="skeleton skeleton-line" style="height:24px;width:40px;margin:4px 0 2px"></div>', '')}
    ${_metricCardHTML('Rata-rata Order', '<div class="skeleton skeleton-line" style="height:24px;width:60px;margin:4px 0 2px"></div>', '')}
    ${_metricCardHTML('vs Periode Lalu', '<div class="skeleton skeleton-line" style="height:24px;width:50px;margin:4px 0 2px"></div>', '')}
  `;
}

function _metricCardHTML(label, value, growth) {
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${growth ? `<div class="metric-growth ${growth.cls}">${growth.text}</div>` : ''}
    </div>`;
}

function _renderMetrics(rows, rowsPrev) {
  const revenue     = rows.reduce((s, r) => s + r.subtotal, 0);
  const orderSet    = new Set(rows.map(r => r.order_id));
  const orderCount  = orderSet.size;
  const avg         = orderCount ? revenue / orderCount : 0;

  const revenuePrev = rowsPrev.reduce((s, r) => s + r.subtotal, 0);
  const growth      = revenuePrev === 0
    ? null
    : ((revenue - revenuePrev) / revenuePrev * 100);

  let growthObj = { cls: 'flat', text: '—' };
  if (growth !== null) {
    if (growth > 0)  growthObj = { cls: 'up',   text: `▲ ${growth.toFixed(1)}% vs periode lalu` };
    else if (growth < 0) growthObj = { cls: 'down', text: `▼ ${Math.abs(growth).toFixed(1)}% vs periode lalu` };
    else growthObj = { cls: 'flat', text: 'Sama dengan periode lalu' };
  }

  document.getElementById('metricsGrid').innerHTML =
    _metricCardHTML('Total Revenue',   formatRupiah(revenue),                  null) +
    _metricCardHTML('Jumlah Order',    `${orderCount} order`,                  null) +
    _metricCardHTML('Rata-rata Order', formatRupiah(avg),                      null) +
    _metricCardHTML('vs Periode Lalu', formatRupiah(revenuePrev), growthObj);
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function _renderChart(rows, from, to) {
  // Buat array tanggal dalam range
  const dates = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) { dates.push(_toYmd(cur)); cur.setDate(cur.getDate() + 1); }

  // Sum revenue per hari
  const revenueByDate = {};
  dates.forEach(d => revenueByDate[d] = 0);
  rows.forEach(r => { if (revenueByDate[r.date] !== undefined) revenueByDate[r.date] += r.subtotal; });

  const labels = dates.map(d => {
    const [, m, dd] = d.split('-');
    return `${dd}/${m}`;
  });
  const values = dates.map(d => revenueByDate[d]);

  const ctx = document.getElementById('revenueChart').getContext('2d');
  if (_chartInst) _chartInst.destroy();
  _chartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: 'rgba(255,77,79,.75)',
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => formatRupiah(ctx.parsed.y)
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: v => v >= 1000000
              ? `${(v/1000000).toFixed(1)}jt`
              : v >= 1000 ? `${(v/1000).toFixed(0)}rb` : v,
            font: { size: 10 },
          },
          grid: { color: '#eee' }
        },
        x: { ticks: { font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

// ─── Podium top-3 ─────────────────────────────────────────────────────────────

function _renderPodium(rows) {
  const wrap = document.getElementById('podiumWrap');
  if (!rows.length) {
    wrap.innerHTML = '<div class="report-empty" style="flex:1">Belum ada data.</div>';
    return;
  }

  // Agregasi per item
  const byItem = {};
  rows.forEach(r => {
    if (!byItem[r.item_name]) byItem[r.item_name] = { qty: 0, revenue: 0 };
    byItem[r.item_name].qty     += r.qty;
    byItem[r.item_name].revenue += r.subtotal;
  });
  const totalRevenue = rows.reduce((s, r) => s + r.subtotal, 0);
  const sorted = Object.entries(byItem)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 3);

  const MEDALS = ['🥇','🥈','🥉'];
  wrap.innerHTML = sorted.map(([name, d], i) => {
    const pct = totalRevenue ? (d.revenue / totalRevenue * 100).toFixed(1) : '0';
    return `
      <div class="podium-card ${i === 0 ? 'rank-1' : ''}">
        <div class="podium-rank">${MEDALS[i]}</div>
        <div class="podium-name">${name}</div>
        <div class="podium-qty">${d.qty}x</div>
        <div class="podium-sub">${formatRupiah(d.revenue)} (${pct}%)</div>
      </div>`;
  }).join('');
}

// ─── Tabel detail ─────────────────────────────────────────────────────────────

function _renderTable(rows) {
  const wrap = document.getElementById('tableWrap');
  if (!rows.length) {
    wrap.innerHTML = '<div class="report-empty">Belum ada data pada periode ini.</div>';
    return;
  }

  // Sort
  const sorted = [...rows].sort((a, b) => {
    let va = a[_sortCol], vb = b[_sortCol];
    if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
    return _sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const colDefs = [
    { key: 'date',        label: 'Tanggal'   },
    { key: 'outlet_name', label: 'Outlet'    },
    { key: 'item_name',   label: 'Item'      },
    { key: 'qty',         label: 'Qty'       },
    { key: 'subtotal',    label: 'Subtotal'  },
  ];

  const thead = colDefs.map(c => {
    const icon = _sortCol === c.key ? (_sortAsc ? '▲' : '▼') : '';
    return `<th onclick="sortTable('${c.key}')">${c.label}<span class="sort-icon">${icon}</span></th>`;
  }).join('');

  const tbody = sorted.map(r => `
    <tr>
      <td>${r.date}</td>
      <td style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.outlet_name}</td>
      <td>${r.item_name}</td>
      <td style="text-align:right;font-weight:700">${r.qty}</td>
      <td style="text-align:right">${formatRupiah(r.subtotal)}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <table class="report-table">
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody}</tbody>
    </table>`;
}

function sortTable(col) {
  if (_sortCol === col) _sortAsc = !_sortAsc;
  else { _sortCol = col; _sortAsc = false; }
  _renderTable(_rawData);
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCSV() {
  if (!_rawData.length) { showToast('Tidak ada data untuk diexport.'); return; }

  const { from, to } = _getActiveDates();
  const outletLabel  = _user.role === 'super_admin'
    ? (document.getElementById('outletFilter').selectedOptions[0]?.text || 'semua')
    : (_user.outlet_id || 'outlet');

  // Bagian 1: detail order
  const lines = [
    '# Detail Order',
    'Tanggal,Outlet,Item,Qty,Subtotal',
    ..._rawData.map(r =>
      `${r.date},"${r.outlet_name}","${r.item_name}",${r.qty},${r.subtotal}`
    ),
    '',
    '# Ranking Menu',
    'Ranking,Item,Total Dipesan,Revenue',
  ];

  // Bagian 2: ranking menu
  const byItem = {};
  _rawData.forEach(r => {
    if (!byItem[r.item_name]) byItem[r.item_name] = { qty: 0, revenue: 0 };
    byItem[r.item_name].qty     += r.qty;
    byItem[r.item_name].revenue += r.subtotal;
  });
  Object.entries(byItem)
    .sort((a, b) => b[1].qty - a[1].qty)
    .forEach(([name, d], i) => {
      lines.push(`${i + 1},"${name}",${d.qty},${d.revenue}`);
    });

  const csv  = lines.join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `laporan-${outletLabel.replace(/\s+/g,'-')}-${from}-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/js/reports.js
git commit -m "feat(reports): logic reports.js — metrics, chart, podium, tabel, export CSV"
```

---

## Task 7: Update Plans.md

**Files:**
- Modify: `Plans.md`

- [ ] **Step 1: Tandai Phase 6 selesai di Plans.md**

Ubah semua `- [ ]` di Phase 6 menjadi `- [x]`:

```
- [x] 6.1 Admin Reports page (`admin/reports.html`) — revenue per outlet, top menu items, order volume
- [x] 6.2 Export CSV per outlet per date range
- [x] 6.3 `manifest.json` + `sw.js` — PWA installable, offline fallback
- [x] 6.4 Print CSS — struk order untuk printer kasir (optional)
```

Tambahkan di bagian `## Completed (Session Log)`:

```
- ✅ 2026-05-21 — Phase 6: Reports (metrics, grafik, podium top-3, tabel detail, export CSV) + PWA + print CSS
```

- [ ] **Step 2: Commit**

```bash
git add Plans.md
git commit -m "chore: tandai Phase 6 selesai di Plans.md"
```

---

## Checklist Self-Review

### Spec coverage
- [x] 6.1 Reports page — Task 5 + 6
- [x] 6.2 Export CSV — Task 6 (`exportCSV()`)
- [x] Metrics cards + growth % — Task 6 (`_renderMetrics`)
- [x] Grafik bar harian — Task 6 (`_renderChart`)
- [x] Podium top-3 🥇🥈🥉 — Task 6 (`_renderPodium`)
- [x] Tabel detail per item per hari, sortable — Task 6 (`_renderTable`, `sortTable`)
- [x] Filter outlet (super_admin) + RLS scope outlet_staff — Task 6 (init + `_fetchRows`)
- [x] Date range preset + custom — Task 6 (`_getActiveDates`, `onPresetChange`)
- [x] 6.3 PWA manifest + sw.js — Task 1 + 2 + 3
- [x] 6.4 Print CSS — Task 4
- [x] Nav Reports di semua halaman admin — Task 4

### Placeholder scan
- Tidak ada TBD/TODO/placeholder ditemukan.

### Type consistency
- `_rawData` bertipe `{order_id, date, outlet_name, item_name, qty, unit_price, subtotal}[]` — konsisten di semua render functions.
- `formatRupiah` dari `utils.js` — sudah ada, tidak perlu didefinisikan ulang.
- `showToast` dari `admin.js` — pastikan function ini ada; jika tidak ada gunakan `console.warn` sebagai fallback di `exportCSV`.
