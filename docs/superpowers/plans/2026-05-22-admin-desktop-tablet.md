# Admin Dashboard Desktop & Tablet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat admin panel SUKA Shawarma responsive untuk tablet (≥768px) dan desktop (≥1200px) dengan sidebar navigation, layout dua kolom, dan modal yang lebih lebar — tanpa mengubah tampilan mobile.

**Architecture:** Semua perubahan dilakukan murni via CSS media queries di `style.css` ditambah satu file `admin-desktop.css` untuk memisahkan concern. HTML tidak perlu diubah; sidebar muncul lewat CSS saja dengan sedikit inline-JS untuk toggle. Admin modal berubah dari bottom-sheet ke centered dialog di desktop.

**Tech Stack:** Vanilla CSS (media query, CSS Grid, Flexbox), Vanilla JS (class toggle sidebar), tidak ada framework atau build step.

---

## File Map

| File | Aksi | Keterangan |
|------|------|-----------|
| `assets/css/admin-desktop.css` | **Buat baru** | Semua overrides tablet/desktop; dimuat setelah style.css di semua admin page |
| `admin/index.html` | **Modifikasi** | Tambah `<link>` admin-desktop.css + wrap konten dengan `.admin-content` |
| `admin/orders.html` | **Modifikasi** | Sama + two-column master-detail layout |
| `admin/menu.html` | **Modifikasi** | Sama |
| `admin/outlets.html` | **Modifikasi** | Sama |
| `admin/users.html` | **Modifikasi** | Sama |
| `admin/reports.html` | **Modifikasi** | Sama |
| `admin/settings.html` | **Modifikasi** | Sama |

---

## Task 1: Buat file CSS admin-desktop.css (Fondasi layout)

**Files:**
- Create: `assets/css/admin-desktop.css`

- [ ] **Step 1: Buat file dengan CSS variables desktop**

Buat file `assets/css/admin-desktop.css`:

```css
/* Admin Desktop & Tablet Overrides
   Dimuat SETELAH style.css di semua halaman admin.
   Mobile (< 768px): tidak ada perubahan sama sekali.
   Tablet (≥ 768px): sidebar muncul, konten melebar.
   Desktop (≥ 1200px): sidebar lebih lebar, layout 2-kolom untuk order.
*/

/* ─── Tablet: 768px+ ──────────────────────────────────────────────────────── */
@media (min-width: 768px) {

  /* Body background jadi brand-bg untuk kontras sidebar */
  body { background: var(--brand-bg); }

  /* Phone shell jadi full-width, hapus max-width 480px */
  .phone {
    max-width: 100%;
    display: grid;
    grid-template-columns: 220px 1fr;
    grid-template-rows: 56px 1fr;
    grid-template-areas:
      "sidebar topbar"
      "sidebar content";
    min-height: 100vh;
    padding-bottom: 0;
    background: var(--bg);
  }

  /* Topbar: baris pertama di kolom kanan */
  .topbar {
    grid-area: topbar;
    position: static;
    border-bottom: 1px solid var(--line);
    border-left: 1px solid var(--line);
  }

  /* Konten utama (semua di bawah topbar) */
  .admin-content {
    grid-area: content;
    overflow-y: auto;
    padding: 16px 20px 40px;
  }

  /* Bottom nav DISEMBUNYIKAN — diganti sidebar */
  .admin-nav { display: none !important; }

  /* ─── Sidebar ────────────────────────────────────────────────────────────── */
  .admin-sidebar {
    grid-area: sidebar;
    display: flex !important; /* override display:none dari mobile */
    flex-direction: column;
    background: var(--ink);
    color: #fff;
    padding: 0;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    z-index: 50;
  }

  .admin-sidebar-logo {
    padding: 18px 20px 16px;
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--brand);
    border-bottom: 1px solid rgba(255,255,255,.08);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .admin-sidebar-logo img { width: 30px; height: 30px; border-radius: 8px; }

  .admin-sidebar-user {
    padding: 14px 20px 12px;
    border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .admin-sidebar-user .name {
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 2px;
  }
  .admin-sidebar-user .role {
    font-size: 11px;
    color: rgba(255,255,255,.45);
  }

  .admin-sidebar-nav {
    flex: 1;
    padding: 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .admin-sidebar-nav a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-xs);
    font-size: 13px;
    font-weight: 500;
    color: rgba(255,255,255,.60);
    text-decoration: none;
    transition: background .1s, color .1s;
  }
  .admin-sidebar-nav a span:first-child { font-size: 17px; line-height: 1; }
  .admin-sidebar-nav a:hover { background: rgba(255,255,255,.07); color: #fff; }
  .admin-sidebar-nav a.active { background: var(--brand); color: #fff; }

  .admin-sidebar-footer {
    padding: 12px 12px 20px;
    border-top: 1px solid rgba(255,255,255,.08);
  }
  .admin-sidebar-footer button {
    width: 100%;
    background: rgba(255,255,255,.07);
    color: rgba(255,255,255,.60);
    border: 0;
    border-radius: var(--radius-xs);
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background .1s, color .1s;
  }
  .admin-sidebar-footer button:hover { background: rgba(255,255,255,.14); color: #fff; }

  /* ─── Filter chips: tidak perlu scroll horizontal lagi ───────────────────── */
  .chips {
    flex-wrap: wrap;
    overflow-x: visible;
    padding: 0 0 12px;
    background: transparent;
  }

  /* ─── Stat cards: grid 4 kolom ───────────────────────────────────────────── */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  /* ─── Admin order rows: tampilkan lebih compact ──────────────────────────── */
  .admin-order-row { padding: 14px 16px; }

  /* ─── Admin modal: centered dialog, bukan bottom sheet ───────────────────── */
  .admin-modal-overlay {
    align-items: center;
  }
  .admin-modal-card {
    border-radius: var(--radius);
    max-width: 560px;
    width: 92%;
    max-height: 85vh;
    margin: auto;
  }

  /* ─── Topbar filter chips (orders): inline dengan search ─────────────────── */
  .outlet-filter-row {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 0 0 12px;
  }
  .outlet-filter-row select { width: 220px; flex-shrink: 0; }

}

/* ─── Desktop: 1200px+ ────────────────────────────────────────────────────── */
@media (min-width: 1200px) {

  /* Sidebar lebih lebar di desktop */
  .phone {
    grid-template-columns: 260px 1fr;
  }

  /* Stat cards: bisa 5+ jika ada */
  .stat-grid {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  /* Orders: layout dua panel (master-detail) */
  .orders-panel {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 16px;
    align-items: start;
  }

  .orders-panel-list {
    position: sticky;
    top: 0;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    padding-right: 4px;
  }

  .orders-panel-detail {
    background: var(--card);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    min-height: 400px;
    padding: 20px;
  }

  .orders-panel-detail-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 400px;
    color: var(--faint);
    font-size: 14px;
    gap: 8px;
  }

  /* Modal lebih lebar di desktop */
  .admin-modal-card {
    max-width: 680px;
  }

}

/* ─── Print: tidak berubah dari sebelumnya ────────────────────────────────── */
@media print {
  .admin-sidebar { display: none !important; }
  .phone { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Verifikasi file terbuat**

Jalankan di terminal:
```
ls assets/css/admin-desktop.css
```
Expected: file ada, tidak kosong.

---

## Task 2: Tambah sidebar HTML ke semua halaman admin

Sidebar HTML ditulis SEKALI di setiap file. Karena tidak ada templating engine, kita tambahkan satu blok HTML yang sama di semua 7 halaman admin. Blok ini harus berada SEBELUM `.topbar` di dalam `.phone`.

**Files:**
- Modify: `admin/index.html`
- Modify: `admin/orders.html`
- Modify: `admin/menu.html`
- Modify: `admin/outlets.html`
- Modify: `admin/users.html`
- Modify: `admin/reports.html`
- Modify: `admin/settings.html`

- [ ] **Step 1: Tambah `<link>` admin-desktop.css di semua halaman admin**

Di setiap halaman admin, di dalam `<head>`, tambahkan SETELAH baris `style.css`:
```html
<link rel="stylesheet" href="../assets/css/admin-desktop.css?v=1" />
```

Lakukan untuk semua 7 file: `admin/index.html`, `admin/orders.html`, `admin/menu.html`, `admin/outlets.html`, `admin/users.html`, `admin/reports.html`, `admin/settings.html`.

- [ ] **Step 2: Tambah blok sidebar di setiap halaman**

Di dalam `.phone`, SEBELUM `<div class="topbar">`, tambahkan:

```html
<!-- Sidebar — hanya muncul di tablet/desktop via CSS -->
<aside class="admin-sidebar" style="display:none">
  <div class="admin-sidebar-logo">
    🌯 SUKA Admin
  </div>
  <div class="admin-sidebar-user">
    <div class="name" id="sidebarName">—</div>
    <div class="role" id="sidebarRole">—</div>
  </div>
  <nav class="admin-sidebar-nav">
    <a href="/admin/index.html"><span>🏠</span><span>Dashboard</span></a>
    <a href="/admin/orders.html"><span>📋</span><span>Pesanan</span></a>
    <a href="/admin/menu.html"><span>🌯</span><span>Menu</span></a>
    <a href="/admin/reports.html"><span>📊</span><span>Laporan</span></a>
    <a href="/admin/outlets.html" class="admin-only"><span>📍</span><span>Outlet</span></a>
    <a href="/admin/users.html" class="admin-only"><span>👥</span><span>Pengguna</span></a>
    <a href="/admin/settings.html" class="admin-only"><span>⚙️</span><span>Pengaturan</span></a>
  </nav>
  <div class="admin-sidebar-footer">
    <button onclick="adminSignOut()">🚪 Keluar</button>
  </div>
</aside>
```

- [ ] **Step 3: Wrap semua konten (di bawah topbar) dengan `.admin-content`**

Di setiap halaman, semua elemen ANTARA topbar dan nav harus dibungkus:
```html
<div class="admin-content">
  <!-- filter chips, order list, stat cards, dll -->
</div>
```

**Catatan:** `.admin-nav` (bottom nav) tetap ada di HTML — hanya disembunyikan via CSS di tablet/desktop.

- [ ] **Step 4: Sinkronisasi sidebar name/role di admin.js**

Buka `assets/js/admin.js`, di dalam fungsi `_renderAdminMeta()`, tambahkan 4 baris:

```javascript
function _renderAdminMeta() {
  const nameEl = document.getElementById('adminName');
  const roleEl = document.getElementById('adminRole');
  if (nameEl) nameEl.textContent = adminUser.full_name || adminUser.email;
  if (roleEl) {
    roleEl.textContent = adminUser.role === 'super_admin' ? 'Super Admin' : 'Staff Outlet';
    roleEl.style.color = adminUser.role === 'super_admin' ? 'var(--brand)' : 'var(--blue)';
  }
  // Sidebar name/role (desktop)
  const sidebarName = document.getElementById('sidebarName');
  const sidebarRole = document.getElementById('sidebarRole');
  if (sidebarName) sidebarName.textContent = adminUser.full_name || adminUser.email;
  if (sidebarRole) sidebarRole.textContent = adminUser.role === 'super_admin' ? 'Super Admin' : 'Staff Outlet';
}
```

- [ ] **Step 5: Aktifkan link active di sidebar**

Di `assets/js/admin.js`, fungsi `setActiveNav()` sudah set `.active` pada `.admin-nav a`. Fungsi ini juga berlaku untuk sidebar karena link sama. Tidak perlu perubahan tambahan.

---

## Task 3: Dashboard (index.html) — Stat cards grid

**Files:**
- Modify: `admin/index.html`

- [ ] **Step 1: Tambah class `stat-grid` ke wrapper stat cards**

Cari wrapper stat cards di `admin/index.html`. Biasanya ada `<div style="display:grid; grid-template-columns:...">`. Tambahkan class `stat-grid` ke elemen tersebut:

```html
<div class="stat-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:12px 0">
```

Di desktop, `.stat-grid` CSS override akan mengganti grid menjadi 4 kolom otomatis.

---

## Task 4: Orders (orders.html) — Two-panel layout desktop

**Files:**
- Modify: `admin/orders.html`

- [ ] **Step 1: Buat orders panel wrapper di dalam `.admin-content`**

Di dalam `<div class="admin-content">`, bungkus `#orderList` dengan `.orders-panel`:

```html
<div class="orders-panel">
  <div class="orders-panel-list">
    <div id="orderList" style="padding:6px 0 20px">
      <!-- order cards di-render oleh JS -->
    </div>
  </div>
  <div class="orders-panel-detail" id="orderDetailPanel">
    <div class="orders-panel-detail-empty">
      <span style="font-size:40px">📋</span>
      <span>Pilih pesanan untuk melihat detail</span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Tambah JS untuk menampilkan detail di panel kanan (desktop)**

Di dalam script `orders.html`, modifikasi fungsi `openOrderDetail(orderId)` (atau fungsi yang membuka modal detail order). Deteksi apakah layar ≥ 1200px; jika ya, render detail ke panel kanan, bukan modal:

```javascript
function openOrderDetail(order) {
  const isDesktop = window.matchMedia('(min-width: 1200px)').matches;
  if (isDesktop) {
    renderDetailPanel(order);
  } else {
    // Mobile/tablet: buka modal seperti biasa
    openOrderModal(order);
  }
}

function renderDetailPanel(order) {
  const panel = document.getElementById('orderDetailPanel');
  if (!panel) return;
  const items = (order.order_items || []).map(i =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
      <span>${i.quantity}× ${i.item_name}</span>
      <span style="color:var(--brand);font-weight:600">${fmtRupiah(i.unit_price * i.quantity)}</span>
    </div>`).join('');

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-weight:700;font-size:16px">${order.order_number}</div>
        <div style="font-size:12px;color:var(--muted)">${fmtDateTime(order.created_at)}</div>
      </div>
      ${statusBadge(order.status)}
    </div>
    <div style="margin-bottom:14px">
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Pelanggan</div>
      <div style="font-weight:600">${order.customer_name}</div>
      <div style="font-size:12px;color:var(--muted)">${order.customer_wa}</div>
    </div>
    <div style="margin-bottom:14px">
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Item Pesanan</div>
      ${items}
    </div>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;padding-top:10px;margin-bottom:20px">
      <span>Total</span>
      <span style="color:var(--brand)">${fmtRupiah(order.total)}</span>
    </div>
    ${buildActionButtons(order)}
  `;
}

function buildActionButtons(order) {
  const next = STATUS_NEXT_ACTION[order.status];
  let html = '';
  if (next) {
    html += `<button class="btn action-primary" style="width:100%;margin-bottom:8px"
      onclick="doUpdateStatus('${order.id}','${next.next}')">${next.label}</button>`;
  }
  if (order.status === 'awaiting_verification') {
    html += `
      <div style="display:flex;gap:8px">
        <button class="btn action-primary" style="flex:1" onclick="doVerifyTransfer('${order.id}','approve')">✅ Setujui</button>
        <button class="btn action-danger" style="flex:1" onclick="doVerifyTransfer('${order.id}','reject')">❌ Tolak</button>
      </div>`;
  }
  if (['paid','preparing','ready'].includes(order.status)) {
    html += `<button class="btn action-secondary" style="width:100%;margin-top:8px"
      onclick="doCancelOrder('${order.id}')">Batalkan Pesanan</button>`;
  }
  return html;
}
```

**Catatan:** `doUpdateStatus`, `doVerifyTransfer`, `doCancelOrder` sudah ada di halaman. Fungsi baru ini hanya me-routing render ke panel vs modal.

---

## Task 5: Reports (reports.html) — Wider layout

**Files:**
- Modify: `admin/reports.html`

- [ ] **Step 1: Tambah class ke filter row**

Cari wrapper filter tanggal/outlet di reports. Tambahkan class `outlet-filter-row`:

```html
<div class="outlet-filter-row report-filters">
  <!-- select outlet, input tanggal, dsb -->
</div>
```

Di tablet, `.outlet-filter-row` akan menampilkan filter secara horizontal dengan select 220px.

---

## Task 6: Test responsivitas di browser

- [ ] **Step 1: Buka `admin/orders.html` di browser**

Gunakan DevTools (F12) → toggle device toolbar. Test breakpoints:
- 375px (iPhone): bottom nav harus muncul, sidebar harus tersembunyi
- 768px (tablet): sidebar harus muncul, bottom nav harus hilang
- 1200px (desktop): panel dua kolom harus aktif

- [ ] **Step 2: Verifikasi sidebar active state**

Buka `admin/reports.html` di layar 768px+. Link "Laporan" di sidebar harus punya class `.active` (background brand orange).

- [ ] **Step 3: Verifikasi modal desktop**

Di layar 768px+, klik salah satu order. Di 768-1199px: modal harus muncul sebagai centered dialog (bukan bottom sheet). Di 1200px+: detail harus render di panel kanan, bukan modal.

- [ ] **Step 4: Verifikasi mobile tidak berubah**

Di layar 375px: tampilan harus persis sama seperti sebelum task ini — bottom nav, single column, tidak ada sidebar.

---

## Task 7: Commit

- [ ] **Step 1: Commit**

```bash
git add assets/css/admin-desktop.css assets/js/admin.js admin/
git commit -m "feat(admin): responsive layout tablet & desktop — sidebar nav + two-panel orders"
```

---

## Catatan Deployment

- File `admin-desktop.css` adalah static asset baru — akan ter-deploy otomatis saat push ke GitHub (auto-deploy via webhook ke cPanel).
- Tidak ada perubahan database, Edge Functions, atau SQL yang diperlukan.
- Cache bust: link di HTML sudah pakai `?v=1`. Jika iterasi, naikkan ke `?v=2`.
