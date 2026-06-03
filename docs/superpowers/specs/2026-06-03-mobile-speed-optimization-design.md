# Mobile Speed Optimization — SUKA Shawarma Order System

**Date:** 2026-06-03  
**Scope:** Customer-facing pages (index.html, checkout.html, order.html) + admin pages  
**Approach:** Quick Wins + Service Worker Optimization (no build step, vanilla JS)  
**Target:** -75-80% load time on repeat visits, -60-70% first visit

---

## Background & Bottlenecks

Current state analysis:

| Bottleneck | Size | Impact |
|---|---|---|
| `logo.png` | 1.9MB | Blocks render on all pages |
| Supabase SDK (CDN) | ~200KB | Blocking script, loaded on every page |
| `style.css` | 51KB | Render-blocking CSS |
| Scripts without `defer` | - | Blocks HTML parsing |
| Menu images (no lazy load) | Varies | Downloads all photos at once |
| QRCode.js loaded upfront | ~50KB | Loaded even when not needed |
| No preconnect hints | - | Cold TCP/TLS per CDN domain |

---

## Section 1 — Image Optimization

### 1a. Replace logo.png with logo.jpg
- `logo.png` (1.9MB) → `logo.jpg` (80KB): **saves 1.8MB**
- Update all references across every HTML file

### 1b. Lazy loading for menu images
Add to all menu `<img>` tags in `index.html`:
```html
<img src="..." loading="lazy" width="80" height="80" alt="..." />
```
- `loading="lazy"` — browser skips off-screen images
- `width` + `height` — prevents Cumulative Layout Shift (CLS)

### 1c. Payment logos
Already small (1–4KB each), no optimization needed. Will be added to SW cache (Section 4).

---

## Section 2 — Script Loading Optimization

### 2a. Add `defer` to all external scripts
Add `defer` attribute to every `<script src="...">` tag across all pages.

**Exception:** `config.js` remains synchronous — Supabase client initialization depends on it being available immediately.

Affected files: `index.html`, `checkout.html`, `order.html`, all `admin/*.html`

### 2b. QRCode.js — dynamic import only when needed
Currently loaded in `<head>` of `order.html` unconditionally.

**Condition to load:** Status = `pending_payment` AND payment_channel = `QRIS`

Replace static `<script>` tag with dynamic load in post-render hooks:
```js
async function loadQRCodeLib() {
  if (window.QRCode) return; // already loaded
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}
// Call before rendering QR code
await loadQRCodeLib();
new QRCode(canvas, { ... });
```

### 2c. config.js stays synchronous
Required before any Supabase client init. No change.

---

## Section 3 — Resource Hints

Add to `<head>` of all customer pages (index.html, checkout.html, order.html):

```html
<!-- Preconnect: open TCP+TLS early for CDN domains -->
<link rel="preconnect" href="https://cdn.jsdelivr.net" />
<link rel="preconnect" href="https://qntuhtkujpwudcpudwbj.supabase.co" />
<link rel="dns-prefetch" href="https://api.xendit.co" />

<!-- Preload critical assets -->
<link rel="preload" href="assets/img/logo.jpg" as="image" />

<!-- Prefetch next likely page -->
<!-- index.html → prefetch checkout.html -->
<!-- checkout.html → prefetch order.html -->
```

**Impact:** Saves 200–400ms per CDN domain on first connect.

---

## Section 4 — Service Worker Optimization

### 4a. Cache CDN libraries in SHELL
Add to SW `SHELL` array so they're cached on first visit:
```js
'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
'https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js',
```

### 4b. Caching strategies per asset type

| Asset type | Strategy | Reason |
|---|---|---|
| HTML pages | Network-first | Customer always gets latest version |
| CSS/JS (local) | Stale-while-revalidate | Fast serve + background update |
| Images (menu photos) | Cache-first | Rarely change, big files |
| CDN libraries | Cache-first | Never change (versioned URLs) |
| Supabase/Xendit API | Network-only | Always fresh data |

### 4c. Cache payment logos
Add `assets/img/payment/*.png` to SHELL — small files, always needed at checkout.

### 4d. Bump SW cache version
`suka-v8` → `suka-v9` to invalidate old cache entries.

---

## Section 5 — Critical CSS (index.html only)

### Problem
`style.css` (51KB) is render-blocking — browser cannot paint anything until the full file is downloaded and parsed.

### Solution
Inline the minimal CSS needed to render above-the-fold content (topbar, hero, skeleton) directly in `<head>`. Load the full stylesheet non-blocking.

```html
<head>
  <!-- Critical CSS inline (~3-5KB) -->
  <style>
    /* CSS variables, reset, layout shell, topbar, hero, skeleton only */
    :root { --brand: #f29744; ... }
    body { margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    .phone { ... }
    .topbar { ... }
    .status-hero { ... }
    /* Skeleton animations */
  </style>

  <!-- Full CSS: non-blocking load -->
  <link rel="preload" href="assets/css/style.css?v=9" as="style"
        onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="assets/css/style.css?v=9" /></noscript>
</head>
```

**Scope:** `index.html` only (first page customer opens, highest priority).

**Critical CSS content:** variables, reset, `.phone`, `.topbar`, `.status-hero`, skeleton loaders, loading overlay (~4KB estimated).

---

## Implementation Order

1. **Image fix** (highest impact, easiest) — logo.png → logo.jpg
2. **Script defer** — add `defer` everywhere  
3. **QRCode.js dynamic import** — order.html
4. **Resource hints** — preconnect + preload + prefetch
5. **SW optimization** — cache strategies + CDN cache + v9
6. **Critical CSS** — index.html inline critical CSS

---

## Success Metrics

| Metric | Before | Target |
|---|---|---|
| First visit total transfer | ~2.5MB+ | <500KB |
| Repeat visit transfer | ~2.5MB | <50KB (SW cache) |
| Time to first paint (3G) | ~4-6s | <1.5s |
| Logo load | ~3s | <0.5s |
