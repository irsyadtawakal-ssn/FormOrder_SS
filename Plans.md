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
- [ ] 3.2 Edge Function: `auto-cancel-expired-orders` — pg_cron tiap 1 menit, scan & cancel expired
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
- [ ] 7.6 Upload foto menu asli semua item
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

## Pending Owner Input
- [ ] Foto menu items — sebagian besar sudah, beberapa item belum. Upload sisa via `admin/bulk-photos.html`
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
- ✅ 2026-05-21 — SQL phone_wa 17 outlet (kitchen/BNR, empang, paledang, cimanggu, depok-sukmajaya, jagakarsa, beji, sawangan, pajajaran, dramaga, cibinong, citayam, tebet, cirendeu, pekayon, jatiwaringin, kalisari)
