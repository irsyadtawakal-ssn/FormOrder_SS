# Admin QR Code Settings — Design Spec

**Date:** 2026-07-13
**Status:** Approved

## Tujuan

Super admin butuh cara cepat untuk generate & download QR code yang mengarah ke
website order (`https://order.sukshawarma.com`), untuk dicetak di materi promosi
(flyer, banner, X-banner outlet, dll). Saat ini tidak ada cara generate QR dari
dalam sistem — admin harus pakai tools eksternal.

## Scope

- Satu QR umum yang mengarah ke homepage `order.sukshawarma.com` (bukan per-outlet).
- Ditambahkan sebagai card baru di [admin/settings.html](../../../admin/settings.html),
  posisi setelah card Logo Banner, sebelum card Biaya Layanan.
- Fully client-side — tidak ada tabel/kolom baru di database, tidak ada state yang
  di-persist di server.

## Fitur

1. **Field UTM opsional** — teks bebas, di-append sebagai query string ke base URL
   saat generate. Contoh: admin isi `utm_source=flyer-agustus` → link jadi
   `https://order.sukshawarma.com?utm_source=flyer-agustus`.
   - Base URL (`https://order.sukshawarma.com`) hardcoded, tidak editable admin,
     karena domain fixed sesuai `docs/superpowers/specs/2026-05-19-sukshawarma-order-design.md`.
   - Kalau field UTM diisi dengan format tidak valid sebagai query string
     (misal ada spasi/karakter aneh), lakukan `encodeURIComponent` per value
     sebelum di-append supaya link tetap valid.
2. **Preview QR live** — canvas QR di-render otomatis saat halaman dibuka
   (default: base URL tanpa UTM), lalu di-regenerate saat admin klik tombol
   "Generate" setelah mengisi/ubah field UTM.
3. **Download PNG** — ambil `canvas.toDataURL('image/png')`, trigger download
   dengan nama file `qr-order-sukshawarma.png`.
4. **Download PDF** — pakai jsPDF, taruh gambar QR di tengah halaman + teks link
   URL di bawahnya (supaya tetap terbaca kalau QR discan gagal), nama file
   `qr-order-sukshawarma.pdf`.

## Implementasi Teknis

- **Library QR:** `qrcode` (soldair/node-qrcode) via CDN unpkg
  (`https://cdn.jsdelivr.net/npm/qrcode@1/build/qrcode.min.js`), render ke
  `<canvas>` pakai `QRCode.toCanvas(canvasEl, url, opts, callback)`.
  - Error correction level: `M` (default) — cukup untuk QR polos tanpa logo.
- **Library PDF:** `jsPDF` via CDN
  (`https://cdn.jsdelivr.net/npm/jspdf@2/dist/jspdf.umd.min.js`).
- Tidak ada perubahan skema Supabase, tidak ada Edge Function baru.
- Ikuti pola card existing di `admin/settings.html` (`.info-card`, `adminToast()`
  untuk feedback, style inline konsisten dengan card lain di file yang sama).

## Error Handling

- Kalau library QR/jsPDF gagal load (CDN down) → tombol download menampilkan
  toast error via `adminToast('❌ Gagal memuat library, coba refresh halaman')`
  saat diklik, bukan crash halaman.
- Tidak ada validasi server-side diperlukan karena tidak ada write ke database.

## Out of Scope

- QR per-outlet (ditolak user saat brainstorming — hanya butuh 1 QR umum).
- Logo SUKA di tengah QR (ditolak user — QR polos saja untuk kemudahan scan).
- Menyimpan riwayat UTM yang pernah digenerate.
