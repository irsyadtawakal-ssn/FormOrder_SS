// Service Worker — SUKA Shawarma
const CACHE = 'suka-v17'; // Naikkan versi setiap kali ada perubahan shell

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
  '/admin/customers.html',
  '/admin/vouchers.html',
  '/admin/monitoring.html',
  '/assets/js/monitoring.js',
  '/assets/css/style.css?v=9',
  '/assets/css/admin-desktop.css?v=6',
  '/assets/js/app.js',
  '/assets/js/admin.js',
  '/assets/js/loyalty.js',
  '/assets/js/supabase.js',
  '/assets/js/utils.js',
  '/assets/img/icon.svg',
  '/manifest.json',
];

// Install — cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(SHELL.map(url => c.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
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

  // Jangan cache request ke Supabase / API eksternal / Xendit
  if (url.hostname.includes('supabase') || url.hostname.includes('cdn.jsdelivr') || url.hostname.includes('xendit')) {
    return; // biarkan browser handle (network)
  }

  // Jangan cache non-GET (POST/PUT/DELETE)
  if (e.request.method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Gunakan Network-First untuk SEMUA aset (HTML, CSS, JS) agar UI selalu up-to-date
  // dan user tidak perlu hapus cache manual saat ada perubahan.
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // Simpan salinan terbaru untuk fallback offline
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) {
            return cached.redirected ? new Response(cached.body, cached) : cached;
          }
          return offlineFallback(e.request);
        })
      )
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
