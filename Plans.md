# Plans — SUKA Shawarma Order System

> Ref spec: `docs/superpowers/specs/2026-05-19-sukshawarma-order-design.md`
> Status: Phase 1–7 sebagian ✅ + Phase 8 (Transfer Manual + AI Verify) ✅ SELESAI

---

## Phase 1 — Foundation ✅
**Scope:** Supabase schema + RLS + seed data + Frontend home + menu
**Output:** Customer bisa browse menu di subdomain

### Tasks
- [x] 1.1 Supabase schema SQL — semua tabel (outlets, categories, menu_items, menu_variants, menu_variant_options, outlet_menu_overrides, orders, order_items, admin_users, notification_logs, notification_templates, app_settings)
- [x] 1.2 RLS policies — semua tabel sesuai spec §4.2
- [x] 1.3 Storage buckets — menu-photos, logos, csv-imports (SQL + instruksi)
- [x] 1.4 Seed data — 19 outlet + 16 menu items + 6 kategori
- [x] 1.5 Home page (`index.html`) — redesign TikTok Food style, langsung tampil menu + outlet dropdown + search
- [x] 1.6 Menu page (`menu.html`) — redirect ke index.html (QR code ready)
- [x] 1.7 `assets/js/supabase.js` — Supabase client singleton
- [x] 1.8 `assets/js/utils.js` — helpers (haversine, formatRupiah, WA validation, localStorage cart)
- [x] 1.9 `assets/css/style.css` — design system, TikTok-style deal cards, outlet selector

---

## Phase 2 — Checkout & Payment ✅
**Scope:** Checkout + manual payment flow + status page
**Output:** E2E order flow — pesan → transfer → pickup

### Tasks
- [x] 2.1 Edge Function: `create-manual-order` — server-side reprice, INSERT orders + order_items, status `pending_payment`
- [x] 2.2 Edge Function: `tripay-webhook` — verify HMAC + idempotency (ready for future)
- [x] 2.3 Edge Function: `check-tripay-status` — fallback polling (ready for future)
- [x] 2.4 Checkout page (`checkout.html`) — transfer manual flow, info rekening BCA, form customer
- [x] 2.5 Order status page (`order.html`) — adaptive view per status + realtime subscribe
- [x] 2.6 `assets/js/app.js` — cart logic, submitManualOrder, payment flow

---

## Phase 3 — Notifications ✅
**Scope:** Fonnte WA integration + auto events
**Output:** WA notif end-to-end customer ↔ admin ↔ outlet

### Tasks
- [x] 3.1 Edge Function: `send-wa-notifications` — Fonnte API, notif admin + outlet + customer
- [x] 3.2 Edge Function: `auto-cancel-expired-orders` — pg_cron tiap 1 menit, scan & cancel expired
- [ ] 3.3 Seed notification_templates — 5 templates default
- [x] 3.4 Integrasi notif ke order flow — events: new_order, ready, cancelled, transfer_submitted, transfer_verified

---

## Phase 4 — Admin Panel Core ✅
**Scope:** Auth + Orders page (realtime) + Menu CRUD + Outlet CRUD
**Output:** Admin bisa manage operations via HP

### Tasks
- [x] 4.1 Admin auth — login page, session check, redirect guard
- [x] 4.2 Admin Dashboard (`admin/index.html`) — summary cards: orders hari ini, revenue, outlet count
- [x] 4.3 Admin Orders page (`admin/orders.html`) — realtime list, status workflow 1-tap, sound notif, filter per outlet
- [x] 4.4 Admin Menu CRUD (`admin/menu.html`) — create/edit/toggle + upload foto + outlet_staff toggle ketersediaan
- [x] 4.5 Admin Outlets CRUD (`admin/outlets.html`) — super_admin only, create/edit/toggle outlets
- [x] 4.6 `assets/js/admin.js` — shared admin utilities, auth check, realtime helpers

---

## Phase 5 — Bulk Import & Settings ✅
**Scope:** CSV import + User management + App settings
**Output:** Admin bisa onboard 19 outlet sekaligus

### Tasks
- [x] 5.1 Admin Users page (`admin/users.html`) — super_admin only, manage outlet_staff accounts
- [x] 5.2 Admin Settings page (`admin/settings.html`) — service_fee, notification templates, app_settings, toggle verifikasi
- [x] 5.3 CSV bulk import outlets — 19 outlet SUKA Shawarma berhasil diimport
- [x] 5.4 CSV bulk import menu — 16 item, 6 kategori berhasil diimport
- [x] 5.5 CSV bulk import outlet_menu_overrides — ready via import.html
- [x] 5.6 Bulk create akun staff — 19 akun outlet staff dibuat via scripts/create-staff-accounts.mjs
- [x] 5.7 Upload foto menu — fitur upload ke Supabase Storage menu-photos bucket

---

## Phase 6 — Reports & PWA ✅
**Scope:** Analytics + Export CSV + PWA installable
**Output:** Owner bisa analisis; karyawan bisa install ke HP

### Tasks
- [x] 6.1 Admin Reports page (`admin/reports.html`) — revenue per outlet, top menu items, order volume
- [x] 6.2 Export CSV per outlet per date range
- [x] 6.3 `manifest.json` + `sw.js` — PWA installable, offline fallback
- [x] 6.4 Print CSS — struk order untuk printer kasir (optional)

---

## Phase 7 — UAT & Go-Live (sebagian ✅)
**Scope:** Deploy + test + rollout
**Output:** Production live

### Tasks
- [x] 7.1 Deploy frontend ke cPanel `public_html/order/` via Git Version Control
- [x] 7.2 Konfigurasi subdomain `order.sukashawarma.com` — DNS propagasi selesai ✅
- [x] 7.3 SSL/HTTPS untuk subdomain order
- [x] 7.4 Auto-deploy via GitHub webhook + deploy.php di cPanel
- [ ] 7.5 End-to-end test semua flow (order → transfer → upload → admin verifikasi)
- [x] 7.6 Upload foto menu asli semua item
- [ ] 7.7 Training karyawan per outlet

---

## Phase 8 — Transfer Manual + AI Verifikasi ✅
**Scope:** Ganti QRIS dengan transfer manual + upload bukti + AI verify
**Output:** Customer transfer → upload bukti → AI/admin verifikasi → proses

### Tasks
- [x] 8.1 Checkout: hapus QRIS, tampil info rekening BCA, hapus biaya layanan
- [x] 8.2 Cart sheet: time picker 13:00–22:00, hapus hint banner & biaya layanan
- [x] 8.3 `create-manual-order`: status awal `pending_payment` (bukan langsung paid)
- [x] 8.4 `order.html`: UI upload bukti transfer (state `pending_payment`) + preview foto
- [x] 8.5 `order.html`: state `awaiting_verification` — tampil foto yang sudah diupload
- [x] 8.6 Storage bucket `transfer-proofs` + RPC `submit_transfer_proof` (anon call)
- [x] 8.7 RPC `verify_transfer` (authenticated) — approve/reject oleh admin
- [x] 8.8 Admin orders: filter chip "💳 Verifikasi", tombol ✅ Verifikasi / ❌ Tolak
- [x] 8.9 Admin orders: modal detail tampil foto + badge AI confidence + extracted data
- [x] 8.10 Edge Function `send-wa-notifications`: event `transfer_submitted` + `transfer_verified`
- [x] 8.11 UX mobile: banner "jangan tutup tab", localStorage persist order URL, recovery banner di index.html
- [x] 8.12 Edge Function `verify-transfer-proof`: OpenRouter Gemini 3.1 Flash Lite — baca nominal, penerima, bank; scoring + auto-approve jika mode AI + confidence high
- [x] 8.13 Admin settings: toggle Manual vs AI Otomatis, simpan ke `app_settings.verification_mode`
- [x] 8.14 Migration SQL: `proof_url`, `proof_submitted_at`, `ai_verification_result` columns

---

## Phase 9 — Loyalty Program ✅
**Scope:** Customers + Vouchers + Milestones + WA notif toggle
**Output:** Admin bisa manage pelanggan loyal + voucher diskon

### Tasks
- [x] 9.1 Migration SQL `20260522_loyalty.sql` — tabel customers, vouchers, customer_vouchers, milestones
- [x] 9.2 Edge Function `on-order-done` — trigger poin + cek milestone + assign voucher otomatis
- [x] 9.3 Admin Customers page (`admin/customers.html`) — list pelanggan, poin, histori
- [x] 9.4 Admin Vouchers page (`admin/vouchers.html`) — CRUD voucher, assign manual
- [x] 9.5 `assets/js/loyalty.js` — loyalty utilities (poin, voucher apply, milestone check)
- [x] 9.6 Toggle notif WA per customer di admin settings

---

## Phase 10 — Xendit QRIS Integration
**Scope:** Ganti transfer manual dengan QRIS dinamis via Xendit
**Output:** Customer scan QR → bayar → auto-confirm → proses otomatis

### Tasks
- [ ] 10.1 Daftar & setup akun Xendit — dapatkan API Key, Secret Key, Callback Token, Business ID
- [ ] 10.2 Simpan credentials ke Supabase Secrets: `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN`
- [x] 10.3 Edge Function `create-xendit-payment` — POST /payment_requests, channel_code QRIS, currency IDR, server-side reprice, return qr_string
- [x] 10.4 Edge Function `xendit-webhook` — verify x-callback-token, idempotency via payment_id, update order status jika payment.capture sukses
- [x] 10.5 Edge Function `check-xendit-status` — fallback polling GET /payment_requests/{id} (untuk timeout recovery)
- [x] 10.6 Checkout page — ganti manual transfer ke Xendit QRIS (simpan qris_string di sessionStorage)
- [x] 10.7 Order page — pending_payment tampil QR code + countdown, auto-update via Supabase realtime
- [x] 10.8 Admin orders — hapus flow verifikasi manual, chip Verifikasi, tombol Approve/Tolak
- [ ] 10.9 E2E test: QRIS scan → payment.capture webhook → order auto-confirmed

---

## Phase 11 — Multi Channel Payment (Virtual Account + E-Wallet)
**Scope:** Tambah pilihan metode bayar selain QRIS — Virtual Account & E-Wallet via Xendit
**Output:** Customer bisa pilih bayar via QRIS, VA bank, atau e-wallet

### Architecture
- Channel yang ditambah: **Virtual Account** (BCA, BNI, BRI, Mandiri) + **E-Wallet** (GoPay, OVO, DANA)
- Semua pakai Xendit Payment Request API yang sama, beda di `payment_method.type`
- Webhook sudah ada (`xendit-webhook`) — tinggal handle event baru
- DB: tambah kolom `payment_channel` untuk simpan pilihan customer (QRIS/BCA/BNI/dll)
- UI: tambah payment method picker di checkout sebelum konfirmasi

### Struktur per channel
| Channel | Type | Xendit field | UI yang tampil |
|---------|------|-------------|----------------|
| QRIS | QR_CODE | channel_code: QRIS | QR code |
| BCA VA | VIRTUAL_ACCOUNT | channel_code: BCA | Nomor VA + bank |
| BNI VA | VIRTUAL_ACCOUNT | channel_code: BNI | Nomor VA + bank |
| BRI VA | VIRTUAL_ACCOUNT | channel_code: BRI | Nomor VA + bank |
| Mandiri VA | VIRTUAL_ACCOUNT | channel_code: MANDIRI | Nomor VA + bank |
| GoPay | EWALLET | channel_code: GOPAY | Deep link / QR |
| OVO | EWALLET | channel_code: OVO | Deep link |
| DANA | EWALLET | channel_code: DANA | Deep link |

### Tasks
- [x] 11.1 Migration SQL — tambah kolom `payment_channel`, `va_number`, `va_bank`, `ewallet_deeplink` di tabel `orders`
- [x] 11.2 Update `create-xendit-payment` — support QRIS/VA/E-Wallet via CHANNEL_CONFIG
- [x] 11.3 Update `xendit-webhook` — sudah handle semua channel via payment.capture
- [x] 11.4 Checkout page — payment method picker (QRIS/VA/E-Wallet) dengan selectChannel()
- [x] 11.5 Order page — pending_payment adaptif: QRIS=QR, VA=nomor+instruksi, E-Wallet=deeplink
- [x] 11.6 Deploy create-xendit-payment + xendit-webhook, push frontend
- [ ] 11.7 E2E test tiap channel
- [x] 11.8 Tambah logo tiap channel pembayaran (QRIS/BCA/BNI/BRI/Mandiri/BJB/BSI/CIMB) di payment picker checkout

---

## Phase 11b — Meta Pixel & Tracking ✅
**Scope:** Meta Pixel dinamis via pengaturan admin — tanpa hardcode, bisa ganti ID kapan saja
**Output:** Admin isi Pixel ID di settings → tracking langsung aktif di semua halaman customer

### Tasks
- [x] 11b.1 `assets/js/pixel.js` — load meta_pixel_id & meta_pixel_enabled dari app_settings, inject fbq dinamis
- [x] 11b.2 Admin Settings — card "Tracking & Pixel": toggle aktif + input Pixel ID, upsert ke app_settings
- [x] 11b.3 Event PageView — otomatis di index.html, checkout.html, order.html
- [x] 11b.4 Event ViewContent — saat menu outlet selesai dimuat (index.html)
- [x] 11b.5 Event AddToCart — saat item ditambah ke cart (index.html)
- [x] 11b.6 Event InitiateCheckout — saat halaman checkout dibuka (checkout.html)
- [x] 11b.7 Event Purchase — saat order status jadi paid, fire sekali via sessionStorage flag (order.html)

---

## Phase 12 — Dokumentasi & Training
**Scope:** Flow diagram + docs untuk onboarding karyawan & referensi tim
**Output:** Dokumen customer journey lengkap per role

### Tasks
- [x] 12.1 Customer journey flow — Customer, Admin, Outlet Staff per-step (`docs/superpowers/specs/2026-06-04-customer-journey-flow.md`)
- [ ] 12.2 Training guide outlet staff — panduan singkat operasional harian
- [ ] 12.3 Training guide admin — panduan verifikasi + manajemen

---

## Phase 13 — Monitoring Sistem ✅
**Scope:** Dashboard kesehatan teknis + alert Telegram otomatis
**Output:** Super admin bisa monitor sistem 24/7, alert otomatis saat ada masalah

### Tasks
- [x] 13.1 Migration: 3 tabel monitoring (`system_events`, `cron_heartbeat`, `alert_state`) + RLS
- [x] 13.2 Dashboard `admin/monitoring.html` — 4 lampu status (Pembayaran, WA Notif, Order Flow, Layanan) + panel anomali
- [x] 13.3 `assets/js/monitoring.js` — logika dashboard, realtime subscribe orders & system_events
- [x] 13.4 Edge Function `system-health-check` — snapshot Fonnte device, rekonsiliasi Xendit, ping eksternal, kapasitas
- [x] 13.5 Edge Function `system-health-monitor` — scan anomali (order nyangkut, cron mati, notif gagal, nol order), anti-spam, kirim Telegram
- [x] 13.6 pg_cron migration — schedule health-monitor tiap 3 menit
- [x] 13.7 Panel kapasitas — tampil DB & storage usage % (vs free tier limits)

### Setup Manual (Owner)
1. **Telegram Bot Token & Chat ID** — setup di Edge Function Secrets:
   - `TELEGRAM_BOT_TOKEN` = token dari @BotFather
   - `TELEGRAM_CHAT_ID` = chat ID dari bot (jalankan `/getUpdates`)
   - ⚠️ **PENTING:** Token yang di-share di chat brainstorm sudah ter-expose. Regenerate via `@BotFather /revoke` sebelum produksi, gunakan token baru.

2. **UptimeRobot** (eksternal, gratis) — monitor terpisah dari Supabase:
   - Tambah HTTP monitor ke `https://order.sukashawarma.com`
   - Integrasikan Telegram notification
   - Inilah satu-satunya layer yang tahu kalau seluruh Supabase/Hostinger tumbang
   - Setup: https://uptimerobot.com (5 menit)

### Monitoring Alert Thresholds
- Order `pending_payment` nyangkut: **> 15 menit**
- Cron job dianggap mati: **> 5 menit** tanpa heartbeat
- WA notif gagal trigger alert: **>= 5** dalam 60 menit
- Nol order di jam buka (13:00-22:00): **dalam 60 menit terakhir**

### Dashboard Features
- **4 lampu status real-time**: Pembayaran (rekonsiliasi Xendit), WA Notif (device Fonnte + rasio), Order Flow (nyangkut), Layanan (ping eksternal)
- **Panel Butuh Perhatian**: order pending > 15 mnt, order paid belum preparing > 20 mnt
- **Metrik 60m/24j**: order bayar, expired/batal, notif gagal
- **Volume chart**: order per jam (12 jam rolling, highlight jam buka)
- **Heartbeat cron**: status `auto-cancel-expired-orders` & `on-order-done`
- **Kapasitas**: DB & storage % (vs 500MB & 1GB free tier)
- **Log Alert**: riwayat alert Telegram yang terkirim (realtime)
- **Realtime**: subscribe orders & system_events → update otomatis
- **Anti-spam**: alert dikirim sekali per masalah, "✅ Pulih" saat selesai

### Catatan Teknis
- Dashboard hanya untuk super_admin (RLS enforced)
- Edge Functions pakai JWT verification (decode payload, check role = service_role)
- Secrets di Edge Function Secrets (bukan Vault)
- Cron job di-schedule dengan service role key hardcode (current_setting tidak accessible di cron context)
- M3 fully async: function jalan status 200 meski tidak ada anomali (expected behavior)

---

## Pending Owner Input
- [x] Foto menu items — semua sudah diupload ✅
- [x] Nomor WA tiap outlet — SQL migration `20260521_outlet_phones.sql` siap, **jalankan di Supabase SQL Editor**
- [x] OPENROUTER_API_KEY — sudah diset di Supabase Secrets
- [x] Logo SUKA Shawarma — `assets/img/logo.png` sudah ada, tampil di topbar semua halaman

---

## Completed (Session Log)
- ✅ 2026-05-21 — 19 outlet diimport dari daftar resmi
- ✅ 2026-05-21 — 16 menu item diimport dari menu board
- ✅ 2026-05-21 — 19 akun staff outlet dibuat (ss.[outlet]@shawarma.com / ss1234)
- ✅ 2026-05-21 — UI redesign TikTok Food style (deal cards, outlet dropdown)
- ✅ 2026-05-21 — Manual payment flow (bayar saat pickup)
- ✅ 2026-05-21 — outlet_staff bisa toggle ketersediaan menu
- ✅ 2026-05-21 — Deploy ke order.sukashawarma.com via cPanel Git
- ✅ 2026-05-21 — compare_price (harga coret + diskon %) di menu
- ✅ 2026-05-21 — Upload foto menu via Supabase Storage
- ✅ 2026-05-21 — Phase 6: Reports + PWA + print CSS
- ✅ 2026-05-21 — Auto-deploy via GitHub webhook (deploy.php di cPanel)
- ✅ 2026-05-21 — WA notifikasi via Fonnte (new_order, ready, cancelled)
- ✅ 2026-05-21 — Fix mobile: anti-zoom, keyboard overlap, outlet staff data isolation
- ✅ 2026-05-21 — Phase 8: Transfer manual flow — upload bukti, AI verify, admin panel verifikasi
- ✅ 2026-05-21 — Bulk upload foto menu via admin/bulk-photos.html (fuzzy auto-match ke nama menu)
- ✅ 2026-05-21 — Logo SUKA Shawarma di topbar (index, order, admin dashboard, login)
- ✅ 2026-05-21 — Edge Function auto-cancel-expired-orders + pg_cron migration
- ✅ 2026-05-21 — SQL phone_wa 17 outlet (kitchen/BNR, empang, paledang, cimanggu, depok-sukmajaya, jagakarsa, beji, sawangan, pajajaran, dramaga, cibinong, citayam, tebet, cirendeu, pekayon, jatiwaringin, kalisari)
- ✅ 2026-05-22 — Design system SUKA (warm palette + Plus Jakarta Sans) applied to all pages
- ✅ 2026-05-22 — proof_rejected status + WA notif untuk bukti transfer ditolak
- ✅ 2026-05-22 — Admin desktop/tablet responsive: sidebar nav, two-panel orders, centered modal [46360d6]
- ✅ 2026-05-22 — Phase 9: Loyalty program — customers, vouchers, milestones, on-order-done Edge Function [6400565]
- ✅ 2026-05-23 — Fix emoji double-encoded di customers.html & vouchers.html (BOM + Windows-1252 → UTF-8 tanpa BOM)
- ✅ 2026-05-23 — Fix window.db ReferenceError di customers.html & vouchers.html (hilang saat encoding fix)
- ✅ 2026-05-23 — Bump SW cache v5 → v6 + asset busting v=6 di 15 file HTML
- ✅ 2026-05-23 — Fix toggle CSS conflict — scope .toggle-switch .toggle-slider agar tidak override global
- ✅ 2026-05-23 — Seragamkan title tab semua halaman customer ke "Order Sukashawarma"
- ✅ 2026-06-03 — Logo payment channel lengkap: QRIS, BCA, BNI, BRI, Mandiri, BJB (webp), BSI, CIMB di assets/img/payment/
- ✅ 2026-06-04 — Customer journey flow diagram (Customer + Admin + Outlet Staff per-step + state machine, Xendit multi-channel)
- ✅ 2026-06-05 — Meta Pixel dinamis: pixel.js + admin settings card + 5 standard events (PageView, ViewContent, AddToCart, InitiateCheckout, Purchase)
