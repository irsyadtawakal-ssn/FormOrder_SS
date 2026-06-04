# Customer Journey Flow — SUKA Shawarma Order System

**Tanggal:** 2026-06-04 (update: Xendit multi-channel)
**Scope:** Flow lengkap per-step untuk 3 role: Customer, Admin (super_admin), Outlet Staff
**Referensi:** `docs/superpowers/specs/2026-05-19-sukshawarma-order-design.md`
**Payment:** Xendit QRIS + Virtual Account (BCA/BNI/BRI/Mandiri) + E-Wallet (GoPay/OVO/DANA)

---

## Ringkasan Alur

```
CUSTOMER ─── pilih menu → bayar (Xendit) ──────────────────────►
   │                              │ webhook auto-confirm          ▲
   │                              ▼                     notif WA  │
   │                         SISTEM (Xendit webhook)              │
   │                              │ status → paid                 │
   │                              ▼                               │
   │                    OUTLET STAFF ─── update status ───────────┘
   │                                                              │
   └──────── notif WA per event ◄─────────────────────────────────┘

Admin berperan sebagai supervisor & manager — bukan di jalur utama order
```

---

## 1. Customer Journey

### Happy Path

```
[1] Buka index.html
     │
     ▼
[2] Lihat outlet list → pilih outlet (dropdown atau klik card)
     │
     ▼
[3] Browse menu → scroll kategori → lihat item + foto + harga
     │
     ▼
[4] Tap item → pilih varian (jika ada) → tap "Tambah"
     │
     ▼
[5] Cart sheet muncul → review items → pilih jam pickup (13:00–22:00)
     │
     ▼
[6] Tap "Pesan Sekarang" → pindah ke checkout.html
     │
     ▼
[7] Isi nama + nomor WA
     │
     ▼
[8] Pilih metode pembayaran:
     ├── 📱 QRIS         — scan QR, semua bank & e-wallet, biaya 0.63%
     ├── 🏦 Virtual Account — BCA / BNI / BRI / Mandiri
     └── 💳 E-Wallet     — GoPay / OVO / DANA
     │
     ▼
[9] Submit order → server reprice → Xendit payment dibuat
     → status: pending_payment
     │
     ▼
[10] Redirect ke order.html — tampilan adaptif per channel:
     │
     ├── QRIS      → QR code + countdown 30 menit → scan dengan HP
     ├── VA        → nomor VA + nama bank + instruksi transfer
     └── E-Wallet  → deep link / QR → tap untuk buka app
     │
     ▼
[11] Customer bayar (scan QR / transfer ke VA / buka e-wallet)
     │
     ▼
[12] Xendit webhook otomatis terima konfirmasi pembayaran
     → status: paid (otomatis, tanpa aksi manual)
     │
     ▼
[13] Notif WA ke customer: "Pembayaran diterima, pesananmu sedang diproses"
     │
     ▼
[14] Outlet siapkan pesanan:
     → status: preparing
     → status: ready
     │
     ▼
[15] Notif WA ke customer: "Pesananmu siap diambil di [nama outlet]!"
     │
     ▼
[16] Customer datang pickup ✅ SELESAI
     → status: done
```

### Error States

| Kondisi | Trigger | Aksi Sistem |
|---------|---------|-------------|
| Tidak bayar dalam 30 menit | Xendit payment expired | Status → `expired`, notif WA, order tidak bisa dilanjutkan |
| Lupa tutup tab | Customer buka halaman lain | Recovery banner muncul di `index.html` (localStorage) |
| Outlet tidak aktif | Admin matikan outlet | Item tidak muncul di menu customer |
| Xendit down | Payment gagal dibuat | Error di checkout, customer diminta coba lagi |

---

## 2. Admin (super_admin) Journey

Admin bukan di jalur utama order — sistem berjalan otomatis via Xendit webhook. Admin berperan sebagai supervisor dan manager.

### Daily Operations

```
[1] Buka admin/login.html → login email + password
     │
     ▼
[2] Dashboard (admin/index.html)
     → lihat: total order hari ini, revenue, jumlah outlet aktif
     │
     ▼
[3] Buka admin/orders.html
     → realtime list semua order dari semua outlet
     → filter: Aktif | Dibayar | Disiapkan | Siap Ambil | Selesai | Semua
     │
     ▼
[4] Monitor alur order (no action needed untuk flow normal):
     pending_payment → paid (auto via Xendit) → preparing → ready → done
     │
     ▼
[5] Aksi manual jika dibutuhkan:
     └── Batalkan order (tombol "Batalkan" di setiap order aktif)
          → status: cancelled → notif WA ke customer
     │
     ▼
[6] Review laporan (kapan saja):
     → admin/reports.html → revenue per outlet, top menu items, volume order
     → export CSV per outlet per date range
```

### Manajemen Tambahan (kapan saja)

| Halaman | Fungsi |
|---------|--------|
| `admin/menu.html` | Tambah / edit / hapus item menu + upload foto |
| `admin/outlets.html` | Tambah / edit / toggle aktif outlet |
| `admin/users.html` | Manage akun outlet staff |
| `admin/customers.html` | Lihat pelanggan, poin loyalti, histori order |
| `admin/vouchers.html` | Buat voucher, assign ke customer |
| `admin/settings.html` | Service fee, toggle notif WA |

### Error States

| Kondisi | Trigger | Aksi Sistem |
|---------|---------|-------------|
| Xendit webhook gagal | Network / timeout | `check-xendit-status` polling fallback tiap 5 detik |
| Order expired tidak terbayar | 30 menit habis | Status otomatis `expired`, admin tidak perlu action |
| Outlet tidak merespons order | Staff offline | Admin bisa cancel manual + hubungi outlet langsung |

---

## 3. Outlet Staff Journey

### Happy Path

```
[1] Buka admin/login.html → login akun outlet staff
     │
     ▼
[2] Dashboard — hanya tampil data outlet sendiri
     → order hari ini, revenue outlet, status item menu
     │
     ▼
[3] Buka admin/orders.html
     → otomatis filter ke outlet sendiri saja
     │
     ▼
[4] Order baru masuk (status: paid) → notifikasi 2 channel:
     → 🔔 suara "ding" di browser
     → 📱 WA notif ke nomor outlet
     │
     ▼
[5] Tap order → lihat detail:
     → item list, varian, jumlah, nama customer, jam pickup yang diminta
     → metode bayar yang digunakan customer
     │
     ▼
[6] Tap "🔄 Disiapkan" → status: preparing
     │
     ▼
[7] Pesanan selesai dibuat → tap "✅ Siap Ambil" → status: ready
     → customer menerima notif WA: "Pesananmu siap diambil!"
     │
     ▼
[8] Customer datang pickup → tap "✅ Selesai" → status: done
     → poin loyalti otomatis ditambah via Edge Function `on-order-done`
     │
     ▼
[9] SELESAI ✅
```

### Manajemen Menu Outlet

```
admin/menu.html
     │
     ▼
Lihat semua item menu
     │
     ├── Toggle ketersediaan item
     │        → Item habis → toggle OFF → tidak muncul di menu customer
     │        → Item tersedia lagi → toggle ON
     │
     └── (super_admin only) Tambah / edit / hapus item
```

### Error States

| Kondisi | Trigger | Aksi Sistem |
|---------|---------|-------------|
| Order paid tapi tidak diproses | Staff tidak tap "Disiapkan" | Order tetap di filter "Dibayar", tidak ada auto-cancel |
| Item habis setelah order masuk | Stok habis mendadak | Proses order, hubungi customer via WA langsung |
| Koneksi browser terputus | Sinyal HP lemah | Realtime Supabase reconnect otomatis, suara notif aktif saat kembali online |

---

## Diagram Integrasi Antar Role

```
Customer          Xendit            Sistem             Outlet Staff       Admin
   │                │                  │                    │               │
   │──submit order──►│                  │                    │               │
   │◄──payment UI────│                  │                    │               │
   │──bayar──────────►│                  │                    │               │
   │                 │──webhook─────────►│                    │               │
   │                 │                  │──status: paid──────►│               │
   │                 │                  │──notif WA customer──►│(cc)           │
   │◄──notif WA paid──────────────────────────────────────────│               │
   │                 │                  │                    │──preparing─────►│
   │                 │                  │                    │──ready──────────►│
   │◄──notif WA siap──────────────────────────────────────────────────────────│
   │──pickup──────────────────────────────────────────────────►│               │
   │                 │                  │                    │──done───────────►│
   │                 │                  │                    │──poin loyalty    │
```

---

## Status Order — State Machine

```
pending_payment  (order dibuat, menunggu pembayaran)
     │
     │ Xendit webhook: payment.capture
     ▼
paid             (pembayaran dikonfirmasi otomatis)
     │
     │ Outlet staff tap "Disiapkan"
     ▼
preparing        (sedang dimasak/disiapkan)
     │
     │ Outlet staff tap "Siap Ambil"
     ▼
ready            (siap diambil, notif WA ke customer)
     │
     │ Outlet staff tap "Selesai" setelah customer pickup
     ▼
done ✅          (selesai, poin loyalty ditambah)

─────────────────────────────────────────────────────────────
(dari pending_payment, jika 30 menit tidak dibayar)
     └──► expired ❌  (Xendit auto-expire)

(dari pending_payment / paid / preparing / ready, jika dibatalkan)
     └──► cancelled ❌ (admin/outlet cancel manual → notif WA customer)
```

---

## Metode Pembayaran yang Didukung

| Channel | Tipe | Biaya | UI di order.html |
|---------|------|-------|-----------------|
| QRIS | QR_CODE | 0.63% | QR code + countdown |
| BCA VA | VIRTUAL_ACCOUNT | flat | Nomor VA + instruksi |
| BNI VA | VIRTUAL_ACCOUNT | flat | Nomor VA + instruksi |
| BRI VA | VIRTUAL_ACCOUNT | flat | Nomor VA + instruksi |
| Mandiri VA | VIRTUAL_ACCOUNT | flat | Nomor VA + instruksi |
| GoPay | EWALLET | % | Deep link + QR |
| OVO | EWALLET | % | Deep link |
| DANA | EWALLET | % | Deep link |
