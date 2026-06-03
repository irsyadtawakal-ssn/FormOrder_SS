# Mobile Speed Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce mobile load time by 60-80% through image optimization, script deferral, resource hints, Service Worker caching, and critical CSS inlining.

**Architecture:** No build step — all changes are pure HTML/CSS/JS edits. Six independent tasks executed in order. Each task is safe to deploy independently.

**Tech Stack:** Vanilla HTML/CSS/JS, Service Worker API, browser resource hints (`preconnect`, `preload`, `prefetch`), CSS `@import` → `<link>` migration.

**Spec:** `docs/superpowers/specs/2026-06-03-mobile-speed-optimization-design.md`

---

## File Map

| File | Change |
|------|--------|
| `assets/img/logo.png` | Keep (don't delete — may be referenced externally) |
| `index.html` | logo ref, lazy images, defer scripts, preconnect, prefetch, critical CSS |
| `checkout.html` | logo ref, defer scripts, preconnect, prefetch |
| `order.html` | logo ref, defer scripts, dynamic QRCode.js, preconnect |
| `admin/*.html` (10 files) | logo ref, defer scripts |
| `assets/css/style.css` | Remove `@import` Google Fonts (move to HTML) |
| `sw.js` | New caching strategies, CDN cache, v9 |

---

## Task 1: Image Optimization — logo.png → logo.jpg + lazy loading

**Files:**
- Modify: `index.html`
- Modify: `checkout.html`
- Modify: `order.html`
- Modify: `admin/index.html`, `admin/login.html`, `admin/orders.html`, `admin/menu.html`, `admin/outlets.html`, `admin/settings.html`, `admin/users.html`, `admin/reports.html`, `admin/customers.html`, `admin/vouchers.html`

- [ ] **Step 1: Ganti semua referensi logo.png → logo.jpg**

Jalankan di terminal project root:
```bash
grep -rn "logo.png" --include="*.html" -l
```
Kemudian untuk setiap file yang ditemukan, ganti `logo.png` dengan `logo.jpg`.

Di semua file HTML, ubah:
```html
<!-- Sebelum -->
<img src="assets/img/logo.png" ...>
<!-- atau -->
<img src="/assets/img/logo.png" ...>

<!-- Sesudah -->
<img src="assets/img/logo.jpg" ...>
```

- [ ] **Step 2: Tambah `loading="lazy"` dan dimensi ke menu images di index.html**

Cari semua tag `<img>` di dalam `renderMenuSections` dan `openItemSheet` di `index.html` dan tambah atribut:

```html
<!-- Deal card image — sebelum -->
${item.photo_url ? `<img src="${item.photo_url}" alt="${escHtml(item.name)}" loading="lazy" />` : '🌯'}

<!-- Deal card image — sesudah -->
${item.photo_url ? `<img src="${item.photo_url}" alt="${escHtml(item.name)}" loading="lazy" width="80" height="80" style="object-fit:cover" />` : '🌯'}
```

```html
<!-- Item sheet hero — sebelum -->
${currentItem.photo_url ? `<img src="${currentItem.photo_url}" alt="${currentItem.name}" />` : '🌯'}

<!-- Item sheet hero — sesudah (tidak lazy — above-fold saat sheet buka) -->
${currentItem.photo_url ? `<img src="${currentItem.photo_url}" alt="${escHtml(currentItem.name)}" width="100%" style="max-height:220px;object-fit:cover" />` : '🌯'}
```

- [ ] **Step 3: Verify — buka index.html di browser, cek Network tab**

Buka DevTools → Network tab → filter "Img". Pastikan:
- `logo.jpg` muncul (bukan `logo.png`)
- File size logo sekitar 80KB (bukan 1.9MB)
- Menu images yang di bawah fold tidak langsung di-request

- [ ] **Step 4: Commit**

```bash
git add index.html checkout.html order.html admin/index.html admin/login.html admin/orders.html admin/menu.html admin/outlets.html admin/settings.html admin/users.html admin/reports.html admin/customers.html admin/vouchers.html
git commit -m "perf: ganti logo.png→logo.jpg (-1.8MB) + lazy loading menu images"
```

---

## Task 2: Script Deferral — tambah `defer` ke semua scripts

**Files:**
- Modify: `index.html`, `checkout.html`, `order.html`
- Modify: `admin/index.html`, `admin/login.html`, `admin/orders.html`, `admin/menu.html`, `admin/outlets.html`, `admin/settings.html`, `admin/users.html`, `admin/reports.html`, `admin/customers.html`, `admin/vouchers.html`, `admin/bulk-photos.html`, `admin/import.html`

- [ ] **Step 1: Tambah `defer` ke semua `<script src>` kecuali config.js**

Untuk setiap file HTML, ubah semua `<script src="...">` menjadi `<script defer src="...">`.

**Aturan:**
- `config.js` → **tetap synchronous** (tidak pakai defer)
- Semua script lain → tambah `defer`

Contoh di `index.html`:
```html
<!-- Sebelum -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="config.js"></script>
<script src="assets/js/supabase.js"></script>
<script src="assets/js/utils.js"></script>

<!-- Sesudah -->
<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="config.js"></script>
<script defer src="assets/js/supabase.js"></script>
<script defer src="assets/js/utils.js"></script>
```

Contoh di `order.html` (juga hapus static QRCode.js — ditangani Task 3):
```html
<!-- Sebelum -->
<script src="https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/..."></script>

<!-- Sesudah — hapus qrcode static, akan di-load dinamis -->
<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/..."></script>
```

Contoh di `admin/*.html`:
```html
<!-- Sebelum -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/..."></script>
<script src="../config.js"></script>
<script src="../assets/js/supabase.js"></script>
<script src="../assets/js/utils.js"></script>
<script src="../assets/js/admin.js"></script>

<!-- Sesudah -->
<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/..."></script>
<script src="../config.js"></script>
<script defer src="../assets/js/supabase.js"></script>
<script defer src="../assets/js/utils.js"></script>
<script defer src="../assets/js/admin.js"></script>
```

- [ ] **Step 2: Pindahkan inline `<script>` blocks ke akhir `<body>` jika perlu**

Dengan `defer`, semua external scripts eksekusi setelah HTML parse selesai. Inline `<script>` blocks yang ada di dalam `<body>` sudah oke karena eksekusi setelah DOM element-nya tersedia.

Cek: pastikan tidak ada inline script yang memanggil `window.db` atau `supabase` sebelum DOM ready. Kalau ada, wrap dalam:
```js
document.addEventListener('DOMContentLoaded', function() {
  // code yang butuh supabase/window.db
});
```

- [ ] **Step 3: Test — buka setiap halaman, pastikan tidak ada error di console**

Buka browser → buka index.html, checkout.html, order.html, admin/login.html.
Cek console: tidak boleh ada `ReferenceError` atau `is not defined`.

- [ ] **Step 4: Commit**

```bash
git add index.html checkout.html order.html admin/
git commit -m "perf: tambah defer ke semua scripts — tidak block HTML parse"
```

---

## Task 3: Dynamic QRCode.js Loading

**Files:**
- Modify: `order.html`

- [ ] **Step 1: Hapus static `<script>` QRCode.js dari order.html**

Di `order.html`, hapus baris:
```html
<script src="https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js"></script>
```

- [ ] **Step 2: Tambah helper `loadQRCodeLib()` di order.html**

Tambah fungsi ini di bagian awal `<script>` block di order.html (sebelum fungsi lain):

```js
// ─── Dynamic load QRCode.js — hanya saat dibutuhkan (QRIS pending_payment) ─────
async function loadQRCodeLib() {
  if (window.QRCode) return; // sudah ter-load sebelumnya
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
```

- [ ] **Step 3: Update post-render hooks — await loadQRCodeLib() sebelum render QR**

Cari bagian post-render hooks di order.html yang memanggil `new QRCode(...)`:

```js
// Sebelum
if (isQris) {
  const qrisStr = o._qris_url || o.qris_url || '';
  if (qrisStr) {
    const canvas = document.getElementById('qrisCanvas');
    if (canvas) {
      try {
        new QRCode(canvas, {
          text: qrisStr,
          width: 220,
          height: 220,
          correctLevel: QRCode.CorrectLevel.M,
        });
      } catch (e) { console.warn('QR render error:', e); }
    }
  }
}
```

Ubah menjadi:
```js
// Sesudah — async dengan dynamic load
if (isQris) {
  const qrisStr = o._qris_url || o.qris_url || '';
  if (qrisStr) {
    const canvas = document.getElementById('qrisCanvas');
    if (canvas) {
      try {
        await loadQRCodeLib();
        new QRCode(canvas, {
          text: qrisStr,
          width: 220,
          height: 220,
          correctLevel: QRCode.CorrectLevel.M,
        });
      } catch (e) { console.warn('QR render error:', e); }
    }
  }
}
```

Catatan: fungsi yang memanggil post-render hooks harus diubah menjadi `async`. Cari fungsi `renderStatus` dan pastikan deklarasinya `async function renderStatus(o)`. Jika inline `switch` case tidak bisa `await`, ekstrak post-render ke fungsi async terpisah:

```js
// Tambah fungsi ini
async function postRenderHooks(o) {
  if (o.status === 'ready') {
    renderOrderQR(o.order_number);
  }
  if (o.status === 'pending_payment') {
    const channel = getChannel(o);
    const isQris  = channel === 'QRIS';
    if (isQris) {
      const qrisStr = o._qris_url || o.qris_url || '';
      if (qrisStr) {
        const canvas = document.getElementById('qrisCanvas');
        if (canvas) {
          try {
            await loadQRCodeLib();
            new QRCode(canvas, {
              text: qrisStr,
              width: 220,
              height: 220,
              correctLevel: QRCode.CorrectLevel.M,
            });
          } catch (e) { console.warn('QR render error:', e); }
        }
      }
    }
    const expiresAt = o._expires_at || o.expires_at;
    if (expiresAt) startCountdownUI(expiresAt);
  }
}

// Di akhir renderStatus(), ubah dari:
//   (inline code)
// Menjadi:
postRenderHooks(o);
```

- [ ] **Step 4: Test — buka order.html?order=... dengan status pending_payment channel QRIS**

Buka browser DevTools → Network tab.
Pastikan `qrcode.min.js` **tidak** di-load saat halaman pertama buka.
Lalu cek bahwa QR code tetap muncul saat status `pending_payment` + channel `QRIS`.

- [ ] **Step 5: Commit**

```bash
git add order.html
git commit -m "perf: dynamic load QRCode.js hanya saat QRIS pending_payment"
```

---

## Task 4: Resource Hints — preconnect, preload, prefetch

**Files:**
- Modify: `index.html`
- Modify: `checkout.html`
- Modify: `order.html`
- Modify: `assets/css/style.css` (hapus @import Google Fonts)

- [ ] **Step 1: Pindahkan Google Fonts dari CSS `@import` ke HTML `<link>`**

Di `assets/css/style.css`, hapus baris pertama:
```css
/* HAPUS ini */
@import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
```

Di `index.html`, `checkout.html`, `order.html`, tambah di `<head>` (setelah `<meta>` tags):
```html
<!-- Google Fonts: preconnect + load -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
```

Untuk admin pages, tambah ke semua `admin/*.html` juga (ganti path `../` jika perlu — Google Fonts adalah absolute URL jadi tidak perlu).

- [ ] **Step 2: Tambah preconnect untuk Supabase dan CDN**

Di `index.html`, `checkout.html`, `order.html`, tambah setelah Google Fonts link:
```html
<!-- Preconnect: buka koneksi awal ke domain yang akan dipakai -->
<link rel="preconnect" href="https://cdn.jsdelivr.net" />
<link rel="preconnect" href="https://qntuhtkujpwudcpudwbj.supabase.co" />
<link rel="dns-prefetch" href="https://api.xendit.co" />
```

- [ ] **Step 3: Tambah preload logo di index.html**

Di `index.html`, tambah setelah preconnect:
```html
<!-- Preload: download logo sebelum browser temukan tag img -->
<link rel="preload" href="assets/img/logo.jpg" as="image" />
```

- [ ] **Step 4: Tambah prefetch halaman berikutnya**

Di `index.html` (customer kemungkinan besar lanjut ke checkout):
```html
<link rel="prefetch" href="checkout.html" />
```

Di `checkout.html` (customer kemungkinan besar lanjut ke order):
```html
<link rel="prefetch" href="order.html" />
```

- [ ] **Step 5: Test — cek di DevTools bahwa hints aktif**

Buka index.html → DevTools → Network tab → filter "Other".
Pastikan ada request dengan type `prefetch` untuk `checkout.html`.

Buka Lighthouse → cek "Avoid render-blocking resources" — Google Fonts tidak boleh muncul lagi sebagai blocking.

- [ ] **Step 6: Commit**

```bash
git add index.html checkout.html order.html assets/css/style.css admin/
git commit -m "perf: resource hints (preconnect/preload/prefetch) + pindah Google Fonts dari CSS @import ke HTML link"
```

---

## Task 5: Service Worker — Caching Strategies + CDN Cache + v9

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Rewrite sw.js dengan multi-strategy caching**

Ganti seluruh isi `sw.js` dengan:

```js
// Service Worker — SUKA Shawarma
// v9: multi-strategy caching + CDN library cache
const CACHE_STATIC  = 'suka-static-v9';   // shell files — cache-first
const CACHE_DYNAMIC = 'suka-dynamic-v9';  // images — cache-first
const CACHE_CDN     = 'suka-cdn-v9';      // CDN libs — cache-first (immutable)

// Shell files: HTML, CSS, JS, critical images
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
  '/admin/customers.html',
  '/admin/vouchers.html',
  '/assets/css/style.css?v=9',
  '/assets/css/admin-desktop.css?v=9',
  '/assets/js/app.js',
  '/assets/js/admin.js',
  '/assets/js/loyalty.js',
  '/assets/js/supabase.js',
  '/assets/js/utils.js',
  '/assets/img/icon.svg',
  '/assets/img/logo.jpg',
  '/assets/img/payment/qris.png',
  '/assets/img/payment/bca.png',
  '/assets/img/payment/bni.png',
  '/assets/img/payment/bri.png',
  '/assets/img/payment/mandiri.png',
  '/assets/img/payment/gopay.png',
  '/assets/img/payment/ovo.png',
  '/assets/img/payment/dana.png',
  '/manifest.json',
];

// CDN libraries: versioned URLs, tidak pernah berubah
const CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js',
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(c =>
        Promise.allSettled(SHELL.map(url => c.add(url).catch(() => null)))
      ),
      caches.open(CACHE_CDN).then(c =>
        Promise.allSettled(CDN_LIBS.map(url => c.add(url).catch(() => null)))
      ),
    ]).then(() => self.skipWaiting())
  );
});

// ─── Activate: hapus cache lama ───────────────────────────────────────────────
self.addEventListener('activate', e => {
  const VALID = [CACHE_STATIC, CACHE_DYNAMIC, CACHE_CDN];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !VALID.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: strategi per tipe request ────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // 1. Supabase & Xendit API — selalu network (data harus fresh)
  if (url.hostname.includes('supabase') || url.hostname.includes('xendit') ||
      url.hostname.includes('fonnte')) {
    return;
  }

  // 2. CDN libraries (jsdelivr) — cache-first, immutable
  if (url.hostname.includes('cdn.jsdelivr') || url.hostname.includes('fonts.googleapis') ||
      url.hostname.includes('fonts.gstatic')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_CDN).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // 3. HTML pages — network-first (customer selalu dapat versi terbaru)
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request).then(cached => cached || offlineFallback(e.request)))
    );
    return;
  }

  // 4. CSS & JS lokal — stale-while-revalidate (serve cache, update background)
  if (url.pathname.match(/\.(css|js)(\?.*)?$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          caches.open(CACHE_STATIC).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 5. Images — cache-first (jarang berubah, file besar)
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)(\?.*)?$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_DYNAMIC).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => new Response('', { status: 503 })))
    );
    return;
  }

  // 6. Fallback — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => offlineFallback(e.request)))
  );
});

// ─── Offline fallback page ────────────────────────────────────────────────────
function offlineFallback(req) {
  if (req.destination === 'document') {
    return new Response(`
      <!doctype html><html lang="id"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Tidak Ada Koneksi</title>
      <style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa}.box{text-align:center;padding:32px}.icon{font-size:64px;margin-bottom:16px}h2{color:#111;margin:0 0 8px}p{color:#666;margin:0}</style>
      </head><body><div class="box"><div class="icon">📡</div><h2>Tidak Ada Koneksi</h2><p>Cek internet kamu dan coba lagi.</p></div></body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }
  return new Response('', { status: 503 });
}
```

- [ ] **Step 2: Update versi CSS di semua HTML (v7 → v9)**

Jalankan untuk cek:
```bash
grep -rn "v=7\|v=8" --include="*.html" -l
```

Update semua `?v=7` dan `?v=8` menjadi `?v=9` di semua HTML files.

- [ ] **Step 3: Test SW di browser**

Buka browser → DevTools → Application → Service Workers.
Klik "Update" → reload halaman.
Pastikan SW baru terdaftar dengan `suka-static-v9`.

Buka Application → Cache Storage. Pastikan ada:
- `suka-static-v9` dengan semua shell files
- `suka-cdn-v9` dengan Supabase SDK

Matikan internet (DevTools → Network → Offline).
Reload halaman — pastikan offline fallback muncul, bukan blank page.

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "perf: SW v9 — multi-strategy caching, CDN library cache, stale-while-revalidate"
```

---

## Task 6: Critical CSS Inline (index.html)

**Files:**
- Modify: `index.html`
- Read: `assets/css/style.css` (extract critical sections)

- [ ] **Step 1: Identifikasi critical CSS dari style.css**

Critical CSS adalah CSS yang diperlukan untuk render above-the-fold di `index.html`:
- CSS variables (`:root`)
- Reset & base (`*, html, body, a, button, img`)
- Layout shell (`.phone`)
- Topbar (`.topbar`, `.topbar-title`, `.topbar-ic`, `.topbar-logo`)
- Hero banner (`.hero-banner` dan terkait)
- Skeleton loaders (`.skeleton`, `@keyframes shimmer`)
- Loading overlay (`.loading-overlay`)

Buka `assets/css/style.css` dan copy section-section tersebut (baris 4–81 untuk variables + reset + layout + topbar, ditambah skeleton dan hero).

- [ ] **Step 2: Tambah critical CSS inline + non-blocking full CSS load di index.html**

Di `index.html`, ubah `<head>` menjadi:

```html
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Order Sukashawarma</title>

<!-- Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />

<!-- Preconnect untuk API -->
<link rel="preconnect" href="https://cdn.jsdelivr.net" />
<link rel="preconnect" href="https://qntuhtkujpwudcpudwbj.supabase.co" />
<link rel="dns-prefetch" href="https://api.xendit.co" />

<!-- Preload critical assets -->
<link rel="preload" href="assets/img/logo.jpg" as="image" />

<!-- Prefetch halaman berikutnya -->
<link rel="prefetch" href="checkout.html" />

<!-- Critical CSS inline — render above-fold tanpa tunggu file eksternal -->
<style>
/* === CRITICAL CSS — variables + reset + shell + topbar + skeleton === */
:root {
  --bg:#fff7ed;--card:#ffffff;--ink:#400a07;--ink2:#6b3a31;
  --muted:#8a6b5e;--faint:#b39a8a;--line:#f2e6d8;--line2:#e6d4bf;
  --brand:#f29744;--brand-dk:#ee8a2c;--brand-bg:#fff1e0;
  --accent:#fbe7df;--accent-ink:#701604;
  --green:#0a7d2c;--green-bg:#f0fdf4;--blue:#2563eb;
  --radius:14px;--radius-sm:10px;--radius-xs:8px;
  --shadow:0 1px 2px rgba(64,10,7,.04),0 4px 16px rgba(64,10,7,.07);
  --shadow-lg:0 8px 30px rgba(64,10,7,.18);
  --container:480px;
  --font:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  --font-display:"Lilita One",system-ui,sans-serif;
}
*,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0;background:#e8e8e8;color:var(--ink);font:14px/1.5 var(--font);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
button{font-family:var(--font);cursor:pointer}
input,textarea{font-family:var(--font)}
img{display:block;max-width:100%}
.phone{max-width:var(--container);margin:0 auto;background:var(--bg);min-height:100vh;position:relative;padding-bottom:120px}
.topbar{position:sticky;top:0;z-index:20;background:var(--card);display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)}
.topbar-title{font-weight:600;font-size:15px}
.topbar-ic{font-size:22px;color:var(--ink2);cursor:pointer;user-select:none;width:32px;text-align:center;border:0;background:none;padding:0;line-height:1}
.topbar-logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:16px;color:var(--brand)}
.topbar-logo img{width:28px;height:28px;border-radius:6px}
.skeleton{background:linear-gradient(90deg,var(--line) 25%,var(--line2) 50%,var(--line) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:var(--radius-xs)}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.skeleton-line{height:14px;border-radius:4px;margin-bottom:8px}
.skeleton-line.short{width:60%}
.loading-overlay{position:fixed;inset:0;background:rgba(255,247,237,.9);display:flex;align-items:center;justify-content:center;z-index:100}
.loading-card{background:var(--card);border-radius:var(--radius);padding:24px 32px;text-align:center;box-shadow:var(--shadow-lg)}
.spinner{width:32px;height:32px;border:3px solid var(--line2);border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>

<!-- Full CSS: non-blocking (render tidak tunggu file ini) -->
<link rel="preload" href="assets/css/style.css?v=9" as="style"
      onload="this.onload=null;this.rel='stylesheet'" />
<noscript><link rel="stylesheet" href="assets/css/style.css?v=9" /></noscript>

<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#f29744" />
</head>
```

- [ ] **Step 3: Verifikasi — tidak ada FOUC (Flash of Unstyled Content)**

Buka index.html di browser dengan throttling 3G (DevTools → Network → 3G).
Pastikan:
- Topbar dan hero muncul langsung (tidak putih dulu)
- Tidak ada layout shift saat full CSS selesai load
- Menu items muncul dengan skeleton loader (bukan blank)

- [ ] **Step 4: Commit**

```bash
git add index.html assets/css/style.css
git commit -m "perf: critical CSS inline di index.html — non-blocking full CSS load"
```

---

## Task 7: Final — Bump versi, push, verify

**Files:**
- Verify all HTML files have `?v=9`
- Modify: `sw.js` jika ada yang terlewat

- [ ] **Step 1: Pastikan semua versi CSS sudah v=9**

```bash
grep -rn "v=7\|v=8\|v=6" --include="*.html" --include="*.js" .
```

Jika masih ada yang lama, update ke `v=9`.

- [ ] **Step 2: Final commit dan push**

```bash
git add -A
git commit -m "perf: finalize mobile speed optimization — bump semua asset ke v=9"
git push
```

- [ ] **Step 3: Test di HP dengan Chrome DevTools remote debugging**

Sambungkan HP via USB → chrome://inspect → pilih halaman.
Buka Performance tab → Record → reload halaman.

Target metrics:
- **First Contentful Paint:** < 1.5s pada 4G
- **Largest Contentful Paint (logo):** < 1s
- **Transfer size first load:** < 500KB
- **Transfer size repeat load:** < 50KB (SW cache)

- [ ] **Step 4: Test Lighthouse**

Buka Chrome DevTools → Lighthouse → Mobile → Generate report.
Target: Performance score > 80.

---

## Catatan Implementasi

- **Jangan hapus `logo.png`** — mungkin ada referensi external atau di email/WA yang dikirim ke customer
- **`config.js` tidak boleh defer** — Supabase client init bergantung padanya
- **Critical CSS hanya di index.html** — halaman lain tidak sepenting ini untuk first paint
- **SW v9 dengan 3 cache** — pisahkan static/dynamic/CDN agar invalidation lebih granular
- **Google Fonts tetap pakai external CDN** — bukan di-self-host, karena sudah di-cache oleh SW
