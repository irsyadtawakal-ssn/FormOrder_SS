# Admin Pages Refactoring Analysis: Login, Menu, and Bulk Photos

## 1. Executive Summary
This report analyzes three admin pages in the SUKA Shawarma system: `admin/login.html`, `admin/menu.html`, and `admin/bulk-photos.html`. Currently, these pages rely on legacy CSS files (`style.css` and `admin-desktop.css`) and inline styles alongside legacy emojis for interface iconography. 

To bring these pages into alignment with the modernized admin panel design seen in `admin/index.html` and `admin/orders.html`, we propose a comprehensive refactoring strategy that:
1. **Adopts Tailwind CSS v4** via the `@tailwindcss/browser@4` script.
2. **Replaces legacy emojis with Lucide Icons** using `lucide@latest`.
3. **Replicates the responsive sidebar/topbar/bottomnav layout** in `admin/menu.html` and `admin/bulk-photos.html` to match `index.html` and `orders.html`.
4. **Removes all legacy stylesheet links** to `style.css` and `admin-desktop.css`.

---

## 2. Current Layout Structure and Legacy Stylesheet References

### A. `admin/login.html`
*   **Stylesheet References**: 
    *   `<link rel="stylesheet" href="../assets/css/style.css?v=7" />`
    *   *No reference to `admin-desktop.css`.*
*   **HTML/CSS Layout Structure**:
    *   Centered single-card layout mimicking a mobile screen via a wrapper class `.phone` (width constraint + padding).
    *   Styled using custom class names from `style.css` (e.g., `form-group`, `form-label`, `form-input`, `btn-add-big`) and inline CSS.
    *   Logo fallback wraps a burrito emoji `🌯` in an `onerror` handler.

### B. `admin/menu.html`
*   **Stylesheet References**:
    *   `<link rel="stylesheet" href="../assets/css/style.css?v=7" />`
    *   `<link rel="stylesheet" href="../assets/css/admin-desktop.css?v=7" />`
*   **HTML/CSS Layout Structure**:
    *   Uses `.phone` wrapper to restrict base size on mobile.
    *   Uses custom layout components defined in `admin-desktop.css` for desktop responsiveness:
        *   `<aside class="admin-sidebar" style="display:none">` (sidebar layout with flex rows and a footer).
        *   `<div class="topbar">` (mobile/tablet header containing title, action buttons).
        *   `<div class="admin-content">` (scrollable content area containing tabs, search, and list).
        *   `<nav class="admin-nav">` (fixed mobile bottom navigation).
    *   Relies heavily on emojis for sidebar and bottomnav item representation.

### C. `admin/bulk-photos.html`
*   **Stylesheet References**:
    *   `<link rel="stylesheet" href="../assets/css/style.css?v=7" />`
    *   *No reference to `admin-desktop.css`.*
*   **HTML/CSS Layout Structure**:
    *   Wraps the layout inside a mobile-optimized `.phone` container.
    *   Implements a mobile topbar with a text-based back chevron `‹` and a standalone back function.
    *   Contains three main content divisions stacked vertically:
        *   `#stepPickCard` (dashed drop area for file upload).
        *   `#matchSection` (review mapping matches list + action upload button).
        *   `#menuGrid` (current menu item image database list).
    *   No responsive sidebar or topbar layout for desktop view; stays rendering as a mobile-optimized layout regardless of viewport width.

---

## 3. Legacy Emoji to Lucide Icon Mapping

To maintain visual semantics while modernizing the interface, we mapped all legacy emojis and text symbols across the three files to Lucide icons:

| Legacy Symbol / Emoji | Context / Usage | Recommended Lucide Icon | Lucide Icon Attribute (`data-lucide`) |
| :--- | :--- | :--- | :--- |
| `🌯` | Burrito/Shawarma (Logo & Menu fallback) | `utensils` | `utensils` |
| `🏠` | Dashboard navigation link | `layout-dashboard` | `layout-dashboard` |
| `📋` | Pesanan (Orders) navigation link | `clipboard-list` | `clipboard-list` |
| `📊` | Laporan (Reports) navigation link | `bar-chart-2` | `bar-chart-2` |
| `🧑‍🤝‍🧑` | Pelanggan (Customers) nav link | `users` | `users` |
| `🏷️` | Promo nav link | `tag` | `tag` |
| `📍` | Outlet nav link / Outlet banner | `map-pin` | `map-pin` |
| `👥` | Pengguna (Users) nav link | `user-cog` | `user-cog` |
| `🔍` | Monitoring nav link / Monitor bottomnav | `activity` | `activity` |
| `⚙️` | Pengaturan (Settings) nav link | `settings` | `settings` |
| `🚪` / `Keluar` | Sign Out action | `log-out` | `log-out` |
| `📷` | Camera icon (Bulk Upload / Form Photos) | `camera` | `camera` |
| `‹` | Back arrow navigation | `chevron-left` or `arrow-left` | `arrow-left` |
| `🖼️` | Step 1 photo chooser dropzone | `image` or `image-plus` | `image-plus` |
| `1️⃣` | Step 1 indicator | *N/A (Use styled number badge)* | *Tailwind number badge* |
| `2️⃣` | Step 2 indicator | *N/A (Use styled number badge)* | *Tailwind number badge* |
| `🚀` | Save/Submit bulk uploads button | `upload` or `upload-cloud` | `upload-cloud` |
| `📄` | File text indicator | `file-image` or `file` | `file-image` |
| `✅` | Confirmation status indicator | `check-circle` or `check` | `check-circle` |
| `⬜` | Empty status / placeholder indicator | `circle` or `image-off` | `image-off` |
| `⭐` | Best Seller star indicator | `star` | `star` |
| `🍽️` | Empty menu listing illustration | `inbox` or `utensils` | `inbox` |
| `❌` | Error status indicator | `x-circle` or `x` | `x-circle` |
| `⏳` | Loading/Uploading button indicator | `loader-2` (animated spin) | `loader-2` |
| `×` | Delete/Dismiss match list entry | `x` or `trash-2` | `x` |

---

## 4. Refactoring Strategy and Layout Replication

To achieve consistency, we must discard `style.css` and `admin-desktop.css` references and replicate the structure of the standardized files (`admin/index.html` and `admin/orders.html`).

### Step 1: Head Configuration
Update the `<head>` of all three pages to import Tailwind CSS v4 and Lucide, configuring the custom theme colors for SUKA Shawarma.

```html
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>[Page Title] — SUKA Admin</title>
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#f29744" />
  <script src="https://unpkg.com/@tailwindcss/browser@4"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style type="text/tailwindcss">
    @theme {
      --color-brand: #f29744;
      --color-brand-bg: #fff8f1;
      --color-brand-dark: #d87c2b;
    }
  </style>
</head>
```

### Step 2: Global Page Wrapper
Use the full-screen layout structure with hidden scroll bars for the viewport and scrollable sub-panels:
```html
<body class="bg-gray-50 text-gray-900 font-sans antialiased">
  <div class="flex h-screen overflow-hidden">
    <!-- Sidebar goes here -->
    
    <!-- Main Panel -->
    <div class="flex-1 flex flex-col h-full overflow-hidden relative">
      <!-- Topbar Header goes here -->
      
      <!-- Scrollable Main Content -->
      <main class="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 bg-gray-50">
        <div id="pageContent" class="max-w-7xl mx-auto space-y-6">
          <!-- Page specific contents -->
        </div>
      </main>
    </div>
    
    <!-- Mobile Bottom Navigation goes here -->
  </div>
</body>
```

### Step 3: Standardizing Sidebar and Navigation
Replicate the sidebar layout from `admin/index.html` in both `menu.html` and `bulk-photos.html`. Ensure that the active link (`a`) has the active styling (`text-brand bg-brand-bg font-medium`), and other links have the passive styling (`text-gray-600 hover:bg-gray-100 hover:text-brand font-medium`).

*   For `menu.html` and `bulk-photos.html`, the **Menu** navigation link should be marked active:
    ```html
    <a href="/admin/menu.html" class="flex items-center gap-3 px-3 py-2 rounded-lg text-brand bg-brand-bg font-medium transition-colors">
      <i data-lucide="utensils" class="w-5 h-5"></i>
      <span>Menu</span>
    </a>
    ```

### Step 4: Initializing Lucide Icons
At the end of initial loading functions or rendering operations, we must call the Lucide initializer to swap attributes for vector icons:
```javascript
if (window.lucide) {
  window.lucide.createIcons();
}
```

---

## 5. Detailed Page-by-Page Implementation Plans

### A. Refactoring Plan for `admin/login.html`
Since the login page is a gateway, it does not include the sidebar or bottomnav, but should adopt the updated Tailwind CSS styling.

#### Proposed Layout Structure
*   A centering flex container (`min-h-screen bg-gray-50 flex items-center justify-center p-4`).
*   A clean card container (`w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 shadow-sm`).
*   **Header Section**: 
    *   Logo: Small margins, dimensions optimized (`h-20 w-auto mb-4 mx-auto`).
    *   Title: `text-2xl font-black text-brand tracking-tight`.
    *   Subtitle: `text-sm text-gray-500 font-medium mt-1`.
*   **Form Controls**:
    *   Vertical stack wrapper (`space-y-4`).
    *   Label: `block text-sm font-bold text-gray-700 mb-1.5`.
    *   Input: `w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-all text-sm`.
*   **Error Panel**: 
    *   Dynamic alert box: `text-sm font-semibold text-brand bg-orange-50 border border-orange-100 rounded-xl p-3 mt-2 hidden`.
*   **Submit Button**: 
    *   Button: `w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50 mt-6`.

---

### B. Refactoring Plan for `admin/menu.html`
Replaces the outdated `admin-desktop.css` flex/grid overrides with desktop sidebar layouts and standard grid displays.

#### Proposed Layout Structure
*   **Topbar Actions**:
    Add responsive, modern buttons matching the layout style of `admin/orders.html`:
    ```html
    <div class="flex items-center gap-2">
      <a href="/admin/bulk-photos.html" class="admin-only flex items-center gap-1.5 text-xs md:text-sm font-bold text-gray-700 bg-white border border-gray-200 px-3.5 py-2 rounded-xl hover:bg-gray-50 transition-colors shadow-sm decoration-none">
        <i data-lucide="camera" class="w-4 h-4 text-gray-500"></i>
        <span class="hidden sm:inline">Bulk Upload</span><span class="sm:hidden">Bulk</span>
      </a>
      <button onclick="openItemForm(null)" class="admin-only flex items-center gap-1.5 text-xs md:text-sm font-bold text-white bg-brand hover:bg-brand-dark px-3.5 py-2 rounded-xl transition-colors shadow-sm">
        <i data-lucide="plus" class="w-4 h-4"></i>
        <span>Tambah</span>
      </button>
    </div>
    ```

*   **Category Chips & Search Bar**:
    *   Display dynamic category selection buttons as a horizontal scrollable row with scrollbars hidden.
    *   Search Bar: Replace simple text boxes with a beautiful inline search with a magnifying glass search icon:
        ```html
        <div class="relative w-full max-w-md">
          <i data-lucide="search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"></i>
          <input type="text" id="menuSearch" placeholder="Cari menu…" oninput="applyFilter()" class="w-full bg-white border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand shadow-sm transition-all" />
        </div>
        ```

*   **Grid Menu List Layout**:
    Update the `#menuList` wrapper to render items as a 1 to 3 column grid depending on screens:
    ```html
    <div id="menuList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    ```

*   **Menu Item Card Structure (Inside JS `menuRow`)**:
    Build an elegant Tailwind-based card that displays availability, seller stats, price, and actions nicely:
    ```javascript
    function menuRow(item) {
      // Logic for variables (availabilities, overrides)
      return `
      <div class="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between" style="opacity:${rowOpacity}" id="menu-${item.id}">
        <div class="flex gap-4 items-start">
          <div class="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center text-2xl shadow-inner border border-orange-50">
            ${item.photo_url
              ? `<img src="${item.photo_url}" class="w-full h-full object-cover" />`
              : `<i data-lucide="utensils" class="w-6 h-6 text-brand"></i>`}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-gray-800 text-sm truncate">${escHtml(item.name)}</div>
            <div class="text-xs text-gray-500 mt-0.5 truncate">${escHtml(catName)}${varCount ? ` · ${varCount} varian` : ''}</div>
            <div class="font-extrabold text-brand text-sm mt-1.5">${formatRupiah(item.base_price)}</div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              ${item.is_best_seller ? `<span class="inline-flex items-center gap-0.5 text-[10px] bg-brand-bg text-brand px-2 py-0.5 rounded-full font-bold border border-brand/10"><i data-lucide="star" class="w-3 h-3 fill-current"></i> Best Seller</span>` : ''}
              ${!isSuperAdmin ? `
                <span class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${isAvail ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-50 text-gray-500 border border-gray-100'}">
                  <span class="w-1.5 h-1.5 rounded-full ${isAvail ? 'bg-green-500' : 'bg-gray-400'}"></span>
                  ${isAvail ? 'Tersedia' : 'Habis'}
                </span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 gap-2">
          ${isSuperAdmin ? `
            <div class="flex items-center gap-2">
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" ${item.is_active ? 'checked' : ''} onchange="toggleItem('${item.id}',this.checked)" class="sr-only peer" />
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
                <span class="ml-1.5 text-xs font-semibold text-gray-600 peer-checked:text-brand">Aktif</span>
              </label>
            </div>
            <div class="flex gap-1.5">
              <button onclick="openItemForm('${item.id}')" class="text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg transition-colors">Edit</button>
              <button onclick="openVariantManager('${item.id}')" class="text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg transition-colors">Varian</button>
              <button onclick="hapusItem('${item.id}','${escHtml(item.name)}')" class="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
          ` : `
            <div class="flex items-center justify-between w-full">
              <span class="text-xs font-medium text-gray-500">Status Toko</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" ${isAvail ? 'checked' : ''} onchange="toggleAvailability('${item.id}',this.checked)" class="sr-only peer" />
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                <span class="ml-1.5 text-xs font-semibold text-gray-600 peer-checked:text-green-600">${isAvail ? 'Tersedia' : 'Habis'}</span>
              </label>
            </div>
          `}
        </div>
      </div>`;
    }
    ```

---

### C. Refactoring Plan for `admin/bulk-photos.html`
Transition from a restricted `.phone` layout to a full-width desktop-accessible layout, complete with Lucide icons.

#### Proposed Layout Structure
*   **Header Section**:
    Display an inline back navigation button alongside page title inside desktop and mobile header bars:
    ```html
    <div class="flex items-center gap-3">
      <button onclick="history.back()" class="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600 shadow-sm">
        <i data-lucide="arrow-left" class="w-5 h-5"></i>
      </button>
      <div class="font-bold text-gray-800 text-lg flex items-center gap-2">
        <i data-lucide="camera" class="w-5 h-5 text-brand"></i> Bulk Upload Foto
      </div>
    </div>
    ```

*   **Step 1: File Selection Dropzone**:
    Redesign the card and upload dropzone as a sleek card wrapper:
    ```html
    <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm" id="stepPickCard">
      <h3 class="flex items-center gap-2 text-base font-extrabold text-gray-800 mb-2">
        <span class="flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white font-extrabold text-xs">1</span>
        <span>Pilih Semua Foto</span>
      </h3>
      <p class="text-xs text-gray-500 mb-4 leading-relaxed">
        Pilih semua foto menu sekaligus. Nama file akan dicocokkan otomatis ke nama menu.<br/>
        <strong>Tips:</strong> beri nama file mirip nama menu, contoh: <code class="bg-gray-100 text-gray-700 px-1 py-0.5 rounded font-mono">shawarma-ayam.jpg</code>
      </p>
      <label class="flex flex-col items-center justify-center gap-3 py-8 px-4 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50 hover:bg-orange-50/10 hover:border-brand/40 transition-colors">
        <i data-lucide="image-plus" class="w-10 h-10 text-gray-400"></i>
        <div class="text-center">
          <div class="font-bold text-sm text-gray-700">Pilih Foto (bisa banyak sekaligus)</div>
          <div class="text-xs text-gray-400 mt-0.5">Mendukung format JPG, PNG, atau WEBP</div>
        </div>
        <input type="file" id="filesInput" accept="image/*" multiple class="hidden" onchange="onFilesSelected(this)" />
      </label>
    </div>
    ```

*   **Step 2: Match & Verification List**:
    Re-style matches rendering wrapper:
    ```html
    <div id="matchSection" class="hidden space-y-4">
      <div class="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h3 class="flex items-center gap-2 text-base font-extrabold text-gray-800 mb-1">
          <span class="flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white font-extrabold text-xs">2</span>
          <span>Cek & Cocokkan</span>
        </h3>
        <p class="text-xs text-gray-500 mb-4">
          Pastikan tiap foto cocok ke menu yang benar. Gunakan pilihan dropdown jika match salah.
        </p>
        <div id="matchList" class="divide-y divide-gray-100"></div>
      </div>
      
      <!-- Summary status bar -->
      <div id="summaryBar" class="p-4 rounded-xl text-sm font-semibold flex items-center gap-2 border"></div>
      
      <!-- Action Upload Button -->
      <button class="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 px-4 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand flex items-center justify-center gap-2" id="btnUploadAll" onclick="doUploadAll()">
        <i data-lucide="upload-cloud" class="w-5 h-5"></i>
        <span>Upload Semua & Simpan</span>
      </button>
    </div>
    ```

*   **Matching List Rows (Inside JS `renderMatches`)**:
    Implement inline flex elements matching the orders details layout:
    ```javascript
    function renderMatches() {
      // Options loop...
      return `
        <div class="flex items-center gap-4 py-3 border-b border-gray-100 last:border-b-0" id="match-${idx}">
          <div class="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
            <img src="${m.preview}" class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 min-w-0 space-y-1.5">
            <div class="text-xs text-gray-400 truncate flex items-center gap-1">
              <i data-lucide="file-image" class="w-3.5 h-3.5"></i> ${m.file.name}
            </div>
            <div class="relative">
              <select class="w-full bg-white border border-gray-200 text-gray-700 rounded-xl pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand appearance-none" onchange="onMatchChange(${idx}, this.value)">
                <option value="">— Tidak dipakai —</option>
                ${opts}
              </select>
              <i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"></i>
            </div>
            <div id="match-status-${idx}" class="text-[11px] font-semibold">
              ${m.menuItemId
                ? `<span class="text-green-600 flex items-center gap-1"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Auto-match: ${menuItems.find(x=>x.id===m.menuItemId)?.name}</span>`
                : `<span class="text-gray-400 flex items-center gap-1"><i data-lucide="image-off" class="w-3.5 h-3.5"></i> Belum dicocokkan — pilih dari dropdown</span>`}
            </div>
          </div>
          <button onclick="removeMatch(${idx})" class="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-gray-50">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>`;
    }
    ```

*   **Summary Alert Bar styling logic**:
    Inject Tailwind class assignments based on matching counts:
    ```javascript
    function updateSummary() {
      // calculations...
      const bar = document.getElementById('summaryBar');
      if (unmatched > 0) {
        bar.className = "bg-amber-50 text-amber-800 border-amber-200 p-4 rounded-xl text-sm font-semibold flex items-center gap-2";
        bar.innerHTML = `<i data-lucide="alert-circle" class="w-5 h-5 text-amber-500"></i><span><b>${matched} dari ${total} foto</b> siap diupload. <span class="text-red-600">${unmatched} belum dicocokkan (akan dilewati).</span></span>`;
      } else {
        bar.className = "bg-green-50 text-green-800 border-green-200 p-4 rounded-xl text-sm font-semibold flex items-center gap-2";
        bar.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5 text-green-500"></i><span><b>${matched} dari ${total} foto</b> siap diupload. Semua cocok! 🎉</span>`;
      }
      if(window.lucide) window.lucide.createIcons();
    }
    ```

*   **Menu Item Grid (Current Status)**:
    Wrap in card:
    ```html
    <div id="menuGrid" class="hidden bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <h3 class="flex items-center gap-2 text-base font-extrabold text-gray-800 mb-4">
        <i data-lucide="clipboard-list" class="w-5 h-5 text-brand"></i>
        <span>Semua Menu Item</span>
      </h3>
      <div id="menuGridList" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"></div>
    </div>
    ```

*   **Menu Grid Entry (Inside JS `renderMenuGrid`)**:
    Build an inline flex layout card component:
    ```javascript
    function renderMenuGrid() {
      const el = document.getElementById('menuGridList');
      el.innerHTML = menuItems.map(item => `
        <div class="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl shadow-xs">
          <div class="w-11 h-11 rounded-lg overflow-hidden border border-gray-200 bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center text-lg flex-shrink-0 shadow-inner">
            ${item.photo_url
              ? `<img src="${item.photo_url}" class="w-full h-full object-cover" />`
              : `<i data-lucide="utensils" class="w-5 h-5 text-brand"></i>`}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-gray-800 text-xs truncate">${item.name}</div>
            <div class="text-[10px] font-semibold flex items-center gap-1 mt-0.5 ${item.photo_url ? 'text-green-600' : 'text-gray-400'}">
              <i data-lucide="${item.photo_url ? 'check-circle' : 'image-off'}" class="w-3.5 h-3.5"></i>
              ${item.photo_url ? 'Sudah ada foto' : 'Belum ada foto'}
            </div>
          </div>
        </div>`).join('');
    }
    ```
