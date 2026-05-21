# SUKA Shawarma — Online Order System

**Spec Date:** 2026-05-19
**Status:** Draft → awaiting owner approval
**Author:** Claude (vibecoding with Bos)
**Target:** MVP untuk pesanan online pickup di 19 outlet

---

## 1. Konteks & Tujuan

### 1.1 Latar Belakang
SUKA Shawarma punya 19 outlet (13 owned chain + 6 mitra/franchise) dengan website utama berbasis WordPress + Elementor (`sukshawarma.com`). Saat ini belum ada kanal order online milik sendiri — bergantung ke aggregator (GoFood/ShopeeFood) yang potong komisi besar dan customer experience tidak terkontrol.

### 1.2 Tujuan
Membangun **website pesanan online ringan & cepat** sebagai sub-sistem terpisah dari WP utama, di subdomain `order.sukshawarma.com`. Khusus untuk **pickup di outlet** (bukan delivery, bukan dine-in, bukan aggregator).

### 1.3 Goals
- ⚡ **Performa:** load < 500ms di HP 4G, total payload < 100kb
- 💰 **Auto-payment:** QRIS dinamis dengan auto-konfirmasi (tanpa admin verifikasi manual)
- 🏪 **Multi-outlet:** 19 outlet dengan harga override per outlet, mitra punya akses kelola sendiri
- 📱 **Mobile-first:** customer & admin operate dari HP
- 🪶 **Ringan:** vanilla HTML/CSS/JS, tanpa framework, tanpa bloat WP

### 1.4 Non-Goals (Out of MVP)
- ❌ Delivery / integrasi kurir
- ❌ Dine-in / nomor meja
- ❌ Customer login / loyalty
- ❌ Promo code / diskon
- ❌ Multi-currency / multi-language
- ❌ POS integration
- ❌ Marketplace untuk merchant lain

---

## 2. Keputusan Arsitektur Utama

### 2.1 Deployment: Subdomain (bukan page WP)
**Keputusan:** `order.sukshawarma.com` — subdomain terpisah, deploy static files langsung di Hostinger.

**Alternatif yang ditolak:**
- ❌ Page di dalam WordPress (`sukshawarma.com/order`) — WP+Elementor load 800kb-2MB baseline, bentrok dengan jQuery, anti-pattern untuk app interaktif.
- ❌ Subdirectory dengan `.htaccess` override — kompleks, gampang ngebug WP.

**Rasional:** Zero conflict dengan WP, < 100kb load, mudah update, SSL terpisah.

### 2.2 Stack Frontend: Vanilla HTML/CSS/JS
**Keputusan:** No framework. Hanya vanilla + Supabase JS SDK (dari CDN).

**Alternatif yang ditolak:**
- ❌ Next.js/Astro — butuh build step, overkill untuk simple app.
- ❌ React/Vue dengan CDN — bundle size > kebutuhan.

**Rasional:** Goal "super ringan" + sederhana untuk maintenance + tidak butuh interaktivitas kompleks.

### 2.3 Database & Backend: Supabase
**Keputusan:** Supabase free tier (Postgres + Auth + Storage + Realtime + Edge Functions).

**Rasional:** Bos sudah familiar; free tier cukup besar untuk skala 19 outlet; built-in fitur lengkap (auth, realtime, storage, RLS); region Singapore (latency rendah ke Indonesia).

### 2.4 Pembayaran: Tripay (QRIS Dinamis via Gateway)

**Keputusan:** Tripay sebagai payment gateway untuk QRIS dinamis dengan auto-konfirmasi.

**Tiga opsi yang dipertimbangkan & didokumentasikan untuk pertimbangan owner:**

#### Opsi A — QRIS Statis + Konfirmasi Manual WA
- **Pros:** Nol biaya integrasi, langsung jalan; tidak perlu KYC baru; familiar untuk UMKM.
- **Cons:** Admin standby cek bukti; risiko bukti palsu; tidak real-time; skalabilitas buruk untuk volume tinggi.
- **Cocok:** Volume < 30/hari, owner aktif balas WA.

#### Opsi B — QRIS Dinamis Mandiri (Direct Bank API)
- **Pros:** Auto real-time; fee paling rendah; settlement langsung.
- **Cons:** KYC berat (PT/CV, NPWP badan, rekening koran); approval 2-4 minggu; butuh deposit; dokumentasi kurang.
- **Cocok:** Enterprise dengan volume > 500/bulan, developer dedicated.

#### Opsi C — QRIS Dinamis via Gateway (Tripay) ⭐ DIPILIH
- **Pros:** Auto real-time; KYC ringan (1-3 hari); dokumentasi rapi; bisa expand ke metode lain; CS responsif.
- **Cons:** Fee sedikit tergantung gateway; settlement H+1/H+2; tergantung uptime pihak ketiga; lock-in vendor.
- **Cocok:** UMKM/SMB yang mau scale tanpa ribet legal.

**Catatan owner:** Akun Tripay sudah dipersiapkan. Bisa downgrade ke A atau upgrade ke B di masa depan kalau kebutuhan berubah.

### 2.5 Notifikasi: Fonnte (WhatsApp Gateway)
**Keputusan:** Fonnte untuk MVP (paket Personal Rp 60-150rb/bulan).

**Alternatif Wablas:** lebih powerful, lebih mahal (~Rp 50rb/bln selisih), komunitas Indonesia lebih kecil.

**Strategi anti-vendor-lock:** Logic WA di-abstract ke 1 file Edge Function (`whatsapp.ts`). Ganti provider tinggal swap implementasi 1 file.

### 2.6 Customer Outlet Selection: List + GPS Auto-Detect
**Keputusan:**
- Homepage `order.sukshawarma.com` tampil list 19 outlet.
- Default: jika user izinkan GPS, urut by jarak terdekat. Jika tolak/error, fallback ke urutan alfabetis.
- User bisa scroll & pilih manual outlet manapun.
- Konfirmasi outlet eksplisit di halaman checkout sebelum bayar.

### 2.7 Cart & Checkout: Multi-Item, Guest, Single-Page Checkout
- Cart disimpan di `localStorage` per outlet slug.
- Guest checkout (no customer login) — minim friction.
- 1 halaman checkout berisi: outlet info + ringkasan order + form pemesan + total + tombol bayar.

### 2.8 Role-Based Admin: 2 Role
- **Super Admin** (HQ/Owner): akses semua outlet & fitur.
- **Outlet Staff** (mitra & karyawan): hanya akses outlet sendiri (filter dipaksa via Supabase RLS).

### 2.9 Multi-Outlet: Shared Menu, Override Price/Stock per Outlet
- Master menu sama di semua outlet (1 source of truth).
- Tabel `outlet_menu_overrides` opsional: kalau ada, override harga & availability per outlet. Kalau tidak ada, pakai default.
- 1 Tripay account pusat (settlement mitra di-handle offline berdasarkan report per outlet).

### 2.10 Service Fee Pass-through
- Biaya layanan Tripay (~0.7%) dibebankan ke customer sebagai line item terpisah di checkout.
- Bisa di-toggle di settings (super admin) — pass-through default, atau absorbed kalau ada promo.

---

## 3. Arsitektur Sistem

```
┌──────────────────────────────────────────────────────────────────┐
│  CUSTOMER (HP)                          ADMIN (Owner/Mitra/Staff)│
│  order.sukshawarma.com                  order.../admin            │
│  └─ Vanilla HTML/CSS/JS, ~30kb                                    │
│     localStorage cart, GPS API, Supabase Realtime                 │
└──────────────┬───────────────────────────────────────────────────┘
               │ HTTPS                            ▲
               ▼                                  │
   ┌───────────────────────────────────────────────────────────┐
   │  HOSTINGER — Subdomain static hosting                     │
   │  /public_html/order/  (customer pages + admin/ pages)     │
   └───────────────────────────────────────────────────────────┘
               │                                  ▲
               ▼                                  │
   ┌───────────────────────────────────────────────────────────┐
   │  SUPABASE (region: Singapore)                             │
   │  • PostgreSQL — outlets, menu, orders, prices, users      │
   │  • Auth — admin login (email/password)                    │
   │  • Storage — foto menu, logo (public read, admin write)   │
   │  • Realtime — admin live order updates, customer status   │
   │  • Edge Functions (Deno):                                 │
   │      - create-tripay-payment                              │
   │      - tripay-webhook                                     │
   │      - send-wa-notifications                              │
   │      - check-tripay-status (fallback)                     │
   │      - auto-cancel-expired-orders (pg_cron 1 menit)       │
   └───────────────────────────────────────────────────────────┘
               │                              │
               ▼                              ▼
   ┌──────────────────┐               ┌──────────────────┐
   │  TRIPAY API      │               │  FONNTE API      │
   │  • Create QRIS   │               │  • Send WA       │
   │  • Webhook PAID  │               │    (admin, outlet,│
   │  • Status check  │               │     customer)     │
   └──────────────────┘               └──────────────────┘
```

---

## 4. Data Model (Supabase Postgres)

### 4.1 Tables

#### `outlets`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| slug | text (unique) | "cimanggu", untuk URL & QR |
| name | text | "SUKA Shawarma Cimanggu" |
| address | text | |
| lat, lng | numeric | untuk hitung jarak GPS |
| phone_wa | text | nomor WA outlet (target Fonnte) |
| type | text | "owned" \| "partner" |
| open_hour, close_hour | time | |
| is_active | boolean | toggle buka/tutup sementara |
| created_at, updated_at | timestamp | |

#### `categories`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | "Makanan", "Minuman" |
| sort_order | integer | |
| is_active | boolean | |

#### `menu_items` (master menu)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| category_id | uuid (FK) | |
| name, description | text | |
| photo_url | text | Supabase Storage URL |
| base_price | numeric | default kalau outlet tidak override |
| is_best_seller | boolean | |
| is_active | boolean | master switch |
| sort_order | integer | |

#### `menu_variants` (group)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| menu_item_id | uuid (FK) | |
| label | text | "Pilih Isi", "Ukuran", "Add-on" |
| is_required | boolean | |
| is_multi | boolean | false=radio, true=checkbox |
| sort_order | integer | |

#### `menu_variant_options`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| variant_id | uuid (FK) | |
| name | text | "Ayam", "Sapi", "Extra Keju" |
| price_modifier | numeric | 0, 5000, dst |
| is_default | boolean | |
| sort_order | integer | |

#### `outlet_menu_overrides`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| outlet_id | uuid (FK) | |
| menu_item_id | uuid (FK) | |
| price_override | numeric (nullable) | null = pakai base_price |
| is_available | boolean | toggle stok per outlet |

> Default behavior: jika tidak ada row untuk pasangan outlet+item, anggap tersedia dengan base_price.

#### `orders`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| order_number | text (unique) | "ORD-2026051901" customer-facing |
| outlet_id | uuid (FK) | |
| customer_name, customer_wa | text | |
| pickup_time | text | free-text input |
| notes | text (nullable) | |
| subtotal, service_fee, total | numeric | |
| status | text | pending_payment \| paid \| preparing \| ready \| done \| cancelled \| expired |
| payment_method | text | "tripay_qris" |
| tripay_reference | text (nullable) | |
| tripay_merchant_ref | text | |
| tripay_pay_url | text | |
| qris_url | text | URL QR code image |
| expires_at | timestamp | now() + 15 min |
| paid_at, ready_at, done_at, cancelled_at | timestamp (nullable) | |
| cancel_reason | text (nullable) | |
| created_at, updated_at | timestamp | |

#### `order_items` (snapshot saat order)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| order_id | uuid (FK) | |
| menu_item_id | uuid (FK, nullable) | nullable jika menu master dihapus |
| item_name | text | snapshot nama |
| selections | jsonb | snapshot varian: `{"Isi":"Ayam","Add-on":["Keju"]}` |
| unit_price | numeric | snapshot harga satuan (sudah include modifier) |
| quantity | integer | |
| subtotal | numeric | |
| note | text (nullable) | catatan per item |

> Snapshot penting agar perubahan menu di masa depan tidak ngubah history order.

#### `admin_users`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK, = auth.users.id) | |
| email, full_name | text | |
| role | text | "super_admin" \| "outlet_staff" |
| outlet_id | uuid (FK, nullable) | null untuk super_admin |
| is_active | boolean | |

#### `notification_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| order_id | uuid (FK) | |
| recipient_type | text | "admin" \| "outlet" \| "customer" |
| recipient_phone | text | |
| message | text | actual content sent |
| status | text | "sent" \| "failed" |
| provider | text | "fonnte" |
| sent_at | timestamp | |
| error | jsonb (nullable) | |

#### `notification_templates`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| key | text (unique) | "new_order_admin", "ready_customer", dst |
| body_template | text | template dengan placeholder `{{order_number}}`, `{{customer_name}}`, dst |
| is_active | boolean | |

#### `app_settings`
| Column | Type | Notes |
|---|---|---|
| key | text (PK) | "service_fee_percent", "qris_expire_minutes", "admin_central_wa", dst |
| value | jsonb | |
| updated_at | timestamp | |

### 4.2 Row Level Security (RLS) Policies

| Tabel | Anonymous (customer) | Outlet Staff | Super Admin |
|---|---|---|---|
| outlets | SELECT (public fields) | SELECT all | ALL |
| categories | SELECT (active) | SELECT | ALL |
| menu_items | SELECT (active) | SELECT | ALL |
| menu_variants | SELECT | SELECT | ALL |
| menu_variant_options | SELECT | SELECT | ALL |
| outlet_menu_overrides | SELECT | SELECT all + WRITE own outlet | ALL |
| orders | INSERT only (via Edge Fn), SELECT own by order_number | SELECT/UPDATE own outlet | ALL |
| order_items | INSERT only (via Edge Fn) | SELECT own outlet's orders | ALL |
| admin_users | — | SELECT own row | ALL |
| notification_logs | — | SELECT own outlet's | ALL |
| notification_templates | — | SELECT | ALL |
| app_settings | SELECT (public keys only) | SELECT (public keys) | ALL |

> Customer-facing tabel `orders` & `order_items` write hanya boleh dari Edge Functions (service role). Frontend tidak boleh INSERT/UPDATE langsung — semua via Edge Function untuk validasi.

### 4.3 Storage Buckets
- `menu-photos` (public read, admin write)
- `logos` (public read, super_admin write)
- `csv-imports` (super_admin only — temp storage for bulk import preview)

---

## 5. Customer Flow & Pages

### 5.1 Pages
| Route | File | Purpose |
|---|---|---|
| `/` | `index.html` | Home — pilih outlet (GPS + list) |
| `/o/:slug` | `menu.html` | Menu outlet dengan cart |
| `/checkout` | `checkout.html` | Checkout single page |
| `/order/:orderNumber` | `order.html` | Status order (post-payment) |

### 5.2 Customer Journey

```
Buka URL → Pilih Outlet → Lihat Menu → Tambah Cart → Checkout → Bayar QRIS
   → [Tripay Webhook] → Status: paid → WA notif customer & admin & outlet
   → Admin tap "Disiapkan" → "Siap" (notif customer) → "Selesai"
```

### 5.3 Page Behaviors

**Home (`/`):**
- Geolocation API minta izin → sort outlet by jarak (Haversine)
- Kalau tolak/error → fallback alfabetis
- Filter: search name, chip by kota
- Outlet tutup ditampilkan abu-abu

**Menu (`/o/:slug`):**
- Sticky banner outlet aktif + tombol "Ganti outlet"
- Categories tabs + search
- Item click → bottom sheet: varian + add-on + qty + catatan + add
- Floating cart bar di bawah
- Cart di `localStorage` per outlet slug; ganti outlet warn clear cart

**Checkout (`/checkout`):**
- 1 page: outlet konfirmasi + ringkasan order + form + total + bayar
- Form: nama, no WA (validasi 08xxx/628xxx), waktu pickup, catatan
- Validasi client + server-side recalculation

**Status (`/order/:orderNumber`):**
- Adaptive view by status: pending_payment / paid / preparing / ready / done / expired / cancelled
- Realtime subscribe `orders:id=eq.<id>`
- Pending: QR + countdown 15:00, tombol fallback "Sudah Bayar? Cek Status"
- Paid+: order number QR/barcode untuk ditunjukkan saat ambil
- Shareable URL (customer bisa bookmark)

---

## 6. Admin Panel

### 6.1 Pages
| Route | Page |
|---|---|
| `/admin` | Dashboard |
| `/admin/orders` | Orders list (real-time) |
| `/admin/menu` | Menu management |
| `/admin/outlets` | Outlet management (super_admin) |
| `/admin/users` | User management (super_admin) |
| `/admin/reports` | Reports & analytics |
| `/admin/settings` | App settings (super_admin) |

### 6.2 Key Features
- **Orders page** = inti operasional. Realtime + sound notif. Status workflow 1-tap.
- **Bulk import CSV** untuk: outlets, menu items, variants, outlet menu overrides.
- **Print-friendly CSS** untuk struk (optional kalau ada printer).
- **PWA installable** (manifest.json + service worker) untuk Add to Home Screen di HP karyawan.
- **Mobile-responsive** — kartu vertikal di mobile, tabel di desktop, tombol 44px min.

### 6.3 Notification System
- Saat order `paid`:
  - WA ke admin pusat (template `new_order_admin`)
  - WA ke outlet (template `new_order_outlet`)
  - WA ke customer (template `paid_customer`)
- Saat order `ready`:
  - WA ke customer (template `ready_customer`)
- Saat order `cancelled`:
  - WA ke customer dengan alasan (template `cancelled_customer`)
- Semua template editable via `/admin/settings`.
- Log ke `notification_logs` untuk audit & debug.

---

## 7. Payment Flow (Tripay)

### 7.1 Create Order Flow
1. Frontend POST `/functions/create-tripay-payment` dengan items + customer info.
2. Edge Function:
   - Validate outlet aktif & items tersedia
   - **Server-side recalculate price** (ignore harga dari client)
   - Calculate service_fee = ceil(subtotal * service_fee_percent)
   - INSERT `orders` (status=pending_payment, expires_at=now()+15min)
   - INSERT `order_items` (snapshot)
   - Call Tripay API `POST /transaction/create` (QRIS, with signature)
   - UPDATE order dengan tripay_reference, qris_url, tripay_pay_url
   - Return order_number + qris_url + expires_at
3. Frontend redirect `/order/:orderNumber`

### 7.2 Webhook Flow
1. Tripay POST ke `/functions/tripay-webhook` dengan callback signature.
2. Edge Function:
   - **Verify HMAC-SHA256 signature** dengan TRIPAY_PRIVATE_KEY
   - Find order by `tripay_merchant_ref`
   - **Idempotency check** — kalau status sudah `paid`, return 200 (no-op)
   - **Amount verification** — `payload.total_amount === order.total`
   - UPDATE order status=paid, paid_at=now()
   - Trigger `send-wa-notifications` (async)
   - Return 200 OK

### 7.3 Security Requirements (WAJIB)
- ✅ Signature verification webhook
- ✅ Idempotency handling
- ✅ Amount verification
- ✅ Server-side price calculation (ignore client)
- ✅ Rate limit `create-tripay-payment` (10 req/min per IP)
- ✅ Tripay credentials di Supabase Secrets (bukan di kode)

### 7.4 Edge Cases
- **Tidak bayar 15 menit:** Tripay set EXPIRED → webhook → status=expired. Backup: pg_cron tiap 1 menit scan & set expired untuk safety.
- **Webhook tidak datang:** customer manual button "Sudah Bayar? Cek Status" → call `check-tripay-status` → poll Tripay API.
- **Browser ke-close setelah bayar:** Server-side tetap update + WA notif. Customer bisa buka URL `/order/:id` lagi.
- **Double payment:** Tripay biasanya reject. Kalau bocor → log + refund manual via Tripay dashboard.
- **Refund:** Admin tap "Batalkan" → status=cancelled + alasan. Refund tidak otomatis — admin manual via Tripay dashboard.

---

## 8. WA Notification Templates

(Editable via `/admin/settings`)

### `new_order_admin` (ke admin pusat)
```
🆕 ORDER BARU MASUK

#{{order_number}}
📍 Outlet: {{outlet_name}}
👤 {{customer_name}} ({{customer_wa}})
⏰ Ambil: {{pickup_time}}

🍽 Pesanan:
{{items_list}}

💰 Total: {{total}}

Detail: {{admin_link}}
```

### `new_order_outlet` (ke outlet)
```
🆕 ORDER BARU - PERLU DISIAPKAN

#{{order_number}}
👤 {{customer_name}} ({{customer_wa}})
⏰ Ambil: {{pickup_time}}

🍽 Pesanan:
{{items_list}}

💰 Total: {{total}} (sudah dibayar)

Buka admin panel untuk update status.
```

### `paid_customer` (ke customer)
```
✅ Pembayaran Berhasil!

Hi {{customer_name}}, terima kasih ya 🙏

Pesanan #{{order_number}} sudah kami terima dan akan disiapkan.

📍 Ambil di:
{{outlet_name}}
{{outlet_address}}
🗺 Maps: {{outlet_maps_url}}

⏰ Estimasi siap: {{pickup_time}}
💰 Total bayar: {{total}}

Cek status: {{status_url}}

Sampai jumpa di outlet! 🌯
```

### `ready_customer` (ke customer)
```
🎉 Pesanan SIAP Diambil!

Hi {{customer_name}}, pesananmu #{{order_number}} sudah siap.

Silakan datang ke:
📍 {{outlet_name}}

Tunjukkan order number ini ke kasir.

Selamat menikmati! 🌯
```

### `cancelled_customer` (ke customer)
```
Maaf {{customer_name}},

Pesanan #{{order_number}} dibatalkan karena: {{reason}}.

Refund akan diproses dalam 1-3 hari kerja ke metode pembayaran yang sama.

Hubungi kami jika ada pertanyaan: {{admin_wa}}
```

---

## 9. Deployment

### 9.1 Folder Structure
```
order.sukshawarma.com/  →  /public_html/order/ (Hostinger)
├── index.html
├── menu.html
├── checkout.html
├── order.html
├── admin/
│   ├── index.html
│   ├── orders.html
│   ├── menu.html
│   ├── outlets.html
│   ├── users.html
│   ├── reports.html
│   └── settings.html
├── assets/
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js
│   │   ├── admin.js
│   │   ├── supabase.js
│   │   └── utils.js
│   ├── img/logo.svg
│   └── audio/ding.mp3
├── manifest.json
├── sw.js
└── robots.txt
```

### 9.2 Deployment Steps (untuk Bos manual)

**Setup Subdomain (1x):**
1. Hostinger hPanel → Subdomain → Create → `order`
2. SSL auto-issued (~10 menit)

**Setup Supabase (1x):**
1. Daftar supabase.com → Create project (region Singapore)
2. Run schema init SQL (provided)
3. Setup Auth (email/password)
4. Catat URL, anon key, service role key

**Setup Tripay (1x):**
1. Sudah ada akun → get API key, private key, merchant code
2. Set callback URL: `https://[project-ref].functions.supabase.co/tripay-webhook`

**Setup Fonnte (1x):**
1. Daftar fonnte.com → paket Personal
2. Scan QR untuk connect device (HP khusus, bukan WA Bos pribadi)
3. Catat API token

**Deploy Frontend (setiap update):**
1. Build folder `/dist/` (provided minified)
2. File Manager Hostinger atau FTP → upload ke `/public_html/order/`

**Deploy Edge Functions (saya yang setup):**
1. `supabase functions deploy [name]`
2. Set env vars (TRIPAY_*, FONNTE_*) via Supabase dashboard

### 9.3 Biaya Operasional Estimasi

| Item | Sekarang | Setelah scale |
|---|---|---|
| Hostinger | dimiliki | — |
| Domain | dimiliki | — |
| Supabase | Free | Pro $25/bln |
| Tripay | 0% setup + 0.7% per tx (passthrough) | — |
| Fonnte | Rp 60-150rb/bln | — |
| **Total** | **~Rp 60rb/bln** | **~Rp 500rb/bln** |

---

## 10. MVP Roadmap (Phases)

| Phase | Scope | Output |
|---|---|---|
| 1. Foundation | Supabase schema + RLS + seed + Frontend home + menu | Dapat browse menu di subdomain |
| 2. Checkout & Payment | Checkout page + Tripay integration + webhook + status page | E2E payment flow with Tripay sandbox |
| 3. Notifications | Fonnte integration + templates + auto-cancel cron | WA notif end-to-end |
| 4. Admin Panel Core | Auth + Orders page (realtime) + Menu CRUD + Outlet CRUD | Admin can manage operations |
| 5. Bulk Import & Settings | CSV import (outlets, menu, variants, overrides) + Users + Settings | Admin can onboard 19 outlets quickly |
| 6. Reports & PWA | Reports + Export CSV + PWA + Print CSS | Owner can analyze; karyawan bisa install ke HP |
| 7. UAT & Go-Live | Pilot 1 outlet → fix → rollout 19 outlet → training | Production live |

---

## 11. Risk Register

| Risiko | Likelihood | Impact | Mitigasi |
|---|---|---|---|
| Tripay down | Low | High | Manual fallback (status check button) |
| Fonnte WA banned | Medium | Medium | Pakai nomor khusus, siap nomor backup, abstract API |
| Supabase free tier exceeded | Low | Low | Monitor usage, upgrade Pro at 70% |
| Karyawan outlet bingung UI | High | Medium | Training + video singkat + 1-week handholding |
| Customer salah pilih outlet | Medium | Low | Konfirmasi eksplisit di checkout + alamat outlet di WA confirm |
| Race condition stok habis | Low | Low | Admin batalkan + refund manual |
| Bukti pembayaran palsu | N/A | N/A | Eliminated by auto-confirm via Tripay |

---

## 12. Future Enhancements (Post-MVP)

- Customer login + history + loyalty points
- Promo code / diskon engine
- Multi payment methods (VA, e-wallet selain QRIS)
- Delivery integration (GoSend, GrabExpress)
- POS integration (sinkron stok kasir fisik)
- Multi-language (EN untuk turis)
- Deep analytics (Mixpanel/Posthog)
- A/B testing pricing
- Auto-refund via Tripay refund API
- Multi-finance role (akuntan terpisah)
- Mobile native apps (React Native / Flutter) jika perlu

---

## 13. Decisions Log (untuk migrasi ke `decisions.md` saat harness-setup)

| # | Decision | Reason |
|---|---|---|
| D1 | Subdomain bukan page WP | Performance, isolation |
| D2 | Vanilla JS bukan framework | Goal "super ringan" |
| D3 | Supabase backend | Familiar, free tier cukup, fitur lengkap |
| D4 | Tripay (not direct bank, not manual) | Auto-confirm + KYC ringan + Bos sudah punya akun |
| D5 | Fonnte (not Wablas) untuk WA | Murah, komunitas besar Indonesia |
| D6 | 2 role (Super Admin + Outlet Staff) | Cukup untuk skala 19 outlet |
| D7 | Shared menu + override per outlet | 1 source of truth + flexibility harga |
| D8 | 1 Tripay account pusat | Settlement mitra di luar sistem |
| D9 | Service fee pass-through ke customer | Mengurangi cost outlet |
| D10 | QRIS expire 15 menit (Tripay default) | Industry standard |
| D11 | Dual WA notif (admin pusat + outlet) | Redundansi, jangan miss order |
| D12 | Snapshot di order_items | History akurasi |
| D13 | Pickup only (no delivery, no dine-in) | MVP scope |
| D14 | Guest checkout (no customer login) | Minim friction |
| D15 | localStorage cart per outlet | Simple state |

---

## 14. UI/UX Strategy

**Keputusan:** UI/UX detail **deferred ke implementation phase** (bukan di spec ini).

**Yang ada di spec sekarang:** struktur halaman, layout components, flow & interaksi, functional wireframe (mockup.html).

**Yang akan dibuat di implementation:** design system (color, typography, spacing), visual polish (animations, micro-interactions, empty states), responsive behaviors, asset integration.

**Tooling:** invoke `frontend-design` skill saat Phase 1-2 implementation untuk generate UI production-grade.

**Brand assets yang perlu disiapkan Bos sebelum/saat Phase 1:**
- Logo SUKA Shawarma (SVG/PNG high-res, transparent background)
- Brand colors (primary/secondary/accent — kalau ada brand guideline)
- Mood/tone preferensi (friendly UMKM / premium modern / bold / cozy middle-eastern)
- Referensi UI yang disukai (screenshot apps/websites lain — optional)
- Foto menu profesional (atau saya pakai placeholder dulu, swap saat siap)

Tanpa input ini, `frontend-design` akan default ke **friendly UMKM warm tones** (palette inspired by shawarma: earthy orange/red + cream + dark accent) — bisa disesuaikan setelah review.

---

## 15. Open Questions / Items Pending Owner Input

- [ ] Data 19 outlet lengkap (nama, alamat, koordinat, no WA, jam buka, type owned/partner) — akan diinput via admin panel bulk CSV setelah live
- [ ] Logo & branding assets — placeholder dulu, owner upload via admin
- [ ] Foto menu items — placeholder dulu, owner upload via admin
- [ ] Admin Pusat WA Number — perlu sebelum go-live untuk notif
- [ ] Fonnte account & API token — perlu setup
- [ ] Supabase project — perlu create (saya pandu)

---

**End of design spec.**
