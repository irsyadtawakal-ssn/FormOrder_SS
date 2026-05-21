# Phase 6 — Reports & PWA Design

**Date:** 2026-05-21
**Project:** SUKA Shawarma Order System

---

## Scope

- 6.1 Admin Reports page (`admin/reports.html`)
- 6.2 Export CSV per outlet per date range
- 6.3 PWA — manifest.json + sw.js
- 6.4 Print CSS untuk struk order (opsional)

---

## 6.1–6.2 Reports + Export CSV

### Akses & RLS

- **super_admin**: bisa pilih semua outlet atau filter per outlet
- **outlet_staff**: outlet otomatis dikunci ke outlet sendiri (RLS enforce di Supabase)

### Filters

- Outlet selector (super_admin saja; staff tidak tampil)
- Date range preset: Hari Ini, 7 Hari, 30 Hari, Custom (date picker)
- Tombol "Terapkan" untuk reload data

### Metrics Cards (baris atas)

| Metrik | Keterangan |
|--------|-----------|
| Total Revenue | Sum `orders.total_price` status `done` |
| Jumlah Order | Count orders status `done` |
| Avg Order Value | Revenue ÷ jumlah order |
| vs Periode Lalu | Perbandingan periode yang sama sebelumnya + growth % (hijau/merah) |

### Grafik

- Bar chart harian — revenue per hari dalam range yang dipilih
- Library: **Chart.js** dari CDN (`https://cdn.jsdelivr.net/npm/chart.js`)
- Ringan, tidak perlu build step

### Tabel Top Menu Items

- Top 10 menu items berdasarkan qty terjual dalam periode
- Kolom: Nama Item, Qty Terjual, Revenue Kontribusi, % dari total

### Export CSV

- Tombol "Export CSV" di bawah tabel top menu
- Generate client-side (pakai Blob + URL.createObjectURL — tidak butuh edge function)
- Isi CSV: semua orders dalam filter yang aktif (order_id, tanggal, outlet, customer_name, items, total)
- Nama file: `laporan-[outlet]-[start]-[end].csv`

### Data Source

- Query `orders` join `order_items` join `menu_items` langsung ke Supabase
- RLS sudah enforce scope outlet untuk outlet_staff
- Semua kalkulasi di client-side (tidak butuh edge function baru)

---

## 6.3 PWA

### manifest.json

File sudah ada di root — lengkapi dengan:

```json
{
  "name": "SUKA Shawarma Order",
  "short_name": "SUKA Order",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0f0f",
  "theme_color": "#ff4d4d",
  "icons": [
    { "src": "assets/img/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/img/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### sw.js

- Cache strategy: **Cache First** untuk shell (HTML/CSS/JS/images)
- Network First untuk API calls ke Supabase (jangan cache)
- Offline fallback: halaman statis "Tidak ada koneksi, cek internet kamu"
- Cache name versioned (`suka-v1`) untuk mudah invalidate

### Icons

- Generate placeholder icons 192px + 512px (background merah `#ff4d4d`, teks "S")
- Bisa diganti dengan logo asli oleh owner nanti

### Link di semua HTML

Tambahkan di `<head>` semua halaman:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#ff4d4d" />
```

Dan di `<body>` sebelum `</body>`:
```html
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');</script>
```

---

## 6.4 Print CSS (opsional)

Tambahkan `@media print` di `assets/css/style.css`:
- Sembunyikan: topbar, nav, filter chips, tombol aksi
- Tampilkan: detail order, items list, total
- Format struk: font kecil, no margin berlebih

---

## Implementation Notes

- Tidak ada edge function baru yang dibutuhkan untuk phase ini
- Chart.js dari CDN — tidak ada npm/build step
- Export CSV murni client-side
- SW scope: `/` (root domain) — pastikan sw.js di root, bukan subfolder
