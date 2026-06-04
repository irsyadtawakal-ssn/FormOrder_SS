# Customer Journey Flow — SUKA Shawarma Order System

**Tanggal:** 2026-06-04  
**Scope:** Flow lengkap per-step untuk 3 role: Customer, Admin (super_admin), Outlet Staff  
**Referensi:** `docs/superpowers/specs/2026-05-19-sukshawarma-order-design.md`

---

## Ringkasan Alur

```
CUSTOMER ──────────────────────────────────────────────────────►
   │                                              ▲
   │ order baru                    notif WA status│
   ▼                                              │
ADMIN (super_admin) ─── verifikasi transfer ─────┤
   │                                              │
   │ order verified → masuk ke outlet             │
   ▼                                              │
OUTLET STAFF ─── update status ──────────────────┘
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
[8] Submit order → server reprice → status: pending_payment
     │
     ▼
[9] Redirect ke order.html → lihat info rekening BCA + nominal transfer
     │
     ▼
[10] Transfer manual ke rekening BCA → tap "Upload Bukti Transfer" → pilih foto
     │
     ▼
[11] Status berubah: awaiting_verification
     │  (banner: "jangan tutup tab ini")
     ▼
[12] Menunggu verifikasi admin/AI...
     │
     ├── ✅ APPROVED → status: confirmed
     │        │
     │        ▼
     │   [13a] Notif WA: "Order dikonfirmasi, sedang diproses"
     │        │
     │        ▼
     │   [14a] Status update: preparing → ready
     │        │
     │        ▼
     │   [15a] Notif WA: "Pesananmu siap diambil di [nama outlet]!"
     │        │
     │        ▼
     │   [16a] Customer datang pickup ✅ SELESAI
     │
     └── ❌ REJECTED → status: payment_rejected
              │
              ▼
         [13b] Notif WA: "Bukti transfer ditolak, silakan upload ulang"
              │
              ▼
         [14b] Customer buka order.html → upload bukti baru → kembali ke step [10]
```

### Error States

| Kondisi | Trigger | Aksi Sistem |
|---------|---------|-------------|
| Lupa tutup tab | Customer buka halaman lain | Recovery banner muncul di `index.html` |
| Order expired | >30 menit tidak upload bukti | `auto-cancel-expired-orders` pg_cron → status: `cancelled` → notif WA |
| Outlet tidak aktif | Outlet dimatikan admin | Item tidak muncul di menu |

---

## 2. Admin (super_admin) Journey

### Happy Path

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
     │
     ▼
[4] Filter chip "💳 Verifikasi" → lihat order berstatus awaiting_verification
     │
     ▼
[5] Tap order → modal detail terbuka
     → lihat: foto bukti transfer, AI confidence score, nominal extracted, nama bank
     │
     ├── Mode AI Otomatis (confidence HIGH ≥ threshold)
     │        → sistem auto-approve, admin hanya monitor
     │        → status langsung: confirmed
     │
     └── Mode Manual (atau confidence LOW)
              │
              ▼
         [6] Admin review foto secara manual
              │
              ├── ✅ Tap "Verifikasi" → status: confirmed
              │        → notif WA dikirim ke customer + outlet
              │
              └── ❌ Tap "Tolak" → status: payment_rejected
                       → notif WA dikirim ke customer
     │
     ▼
[7] Order confirmed → pindah ke filter "Aktif"
     │
     ▼
[8] Monitor update status dari outlet: confirmed → preparing → ready → completed
     │
     ▼
[9] Review laporan (kapan saja):
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
| `admin/settings.html` | Service fee, mode verifikasi (Manual/AI), toggle notif WA |

### Error States

| Kondisi | Trigger | Aksi Sistem |
|---------|---------|-------------|
| AI service down | OpenRouter tidak merespons | Fallback otomatis ke mode manual |
| Order expired | pg_cron auto-cancel | Muncul di filter "Cancelled", admin tidak perlu action |
| Confidence rendah | AI tidak yakin | Order tetap di antrian manual, tidak auto-approve |

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
[4] Order baru masuk → notifikasi 2 channel:
     → 🔔 suara "ding" di browser
     → 📱 WA notif ke nomor outlet
     │
     ▼
[5] Tap order → lihat detail:
     → item list, varian, jumlah, nama customer, jam pickup yang diminta
     │
     ▼
[6] Tap "✅ Konfirmasi" → status: confirmed
     → customer menerima notif WA "Order dikonfirmasi"
     │
     ▼
[7] Mulai siapkan pesanan → tap "🔄 Preparing" → status: preparing
     │
     ▼
[8] Pesanan selesai dibuat → tap "✅ Siap" → status: ready
     → customer menerima notif WA: "Pesananmu siap diambil!"
     │
     ▼
[9] Customer datang pickup → tap "✅ Selesai" → status: completed
     → poin loyalti otomatis ditambah via Edge Function `on-order-done`
     │
     ▼
[10] SELESAI ✅
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
| Lupa konfirmasi order | Order masuk tapi tidak direspons | pg_cron auto-cancel setelah expired, outlet dinotif WA |
| Item habis setelah order masuk | Stok habis mendadak | Konfirmasi order dulu, lalu hubungi customer via WA langsung untuk negosiasi |
| Koneksi browser terputus | Sinyal HP lemah | Realtime Supabase reconnect otomatis, suara notif aktif saat kembali online |

---

## Diagram Integrasi Antar Role

```
Customer          Admin              Outlet Staff       Sistem
   │                │                     │                │
   │──submit order──►│                     │                │
   │                │──verifikasi transfer─►│(notif)         │
   │                │──approve────────────►│                │
   │◄──notif WA─────│                     │                │
   │                │                     │──konfirmasi────►│
   │                │                     │──preparing─────►│
   │                │                     │──ready──────────►│
   │◄──notif WA siap─────────────────────────────────────────│
   │──pickup──────────────────────────────►│                │
   │                │                     │──completed─────►│
   │                │                     │                │──poin loyalty
```

---

## Status Order — State Machine

```
pending_payment
     │
     ▼ (customer upload bukti)
awaiting_verification
     │
     ├──► payment_rejected ──► (customer upload ulang) ──► awaiting_verification
     │
     ▼ (admin/AI approve)
confirmed
     │
     ▼ (outlet staff)
preparing
     │
     ▼ (outlet staff)
ready
     │
     ▼ (outlet staff)
completed ✅

(dari mana saja, jika expired)
     └──► cancelled ❌
```
