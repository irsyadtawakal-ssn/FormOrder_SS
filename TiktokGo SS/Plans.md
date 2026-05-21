# Plans — SUKA Shawarma Order System

> Ref spec: `docs/superpowers/specs/2026-05-19-sukshawarma-order-design.md`
> Status: Phase 1–5 ✅ SELESAI + Phase 7 sebagian ✅ — Phase 3 & 6 berikutnya

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
**Output:** E2E order flow — pesan → bayar saat pickup

### Tasks
- [x] 2.1 Edge Function: `create-manual-order` — bypass Tripay, order langsung status paid
- [x] 2.2 Edge Function: `tripay-webhook` — verify HMAC + idempotency (ready for future)
- [x] 2.3 Edge Function: `check-tripay-status` — fallback polling (ready for future)
- [x] 2.4 Checkout page (`checkout.html`) — manual payment flow, form customer
- [x] 2.5 Order status page (`order.html`) — adaptive view per status + realtime subscribe
- [x] 2.6 `assets/js/app.js` — cart logic, submitManualOrder, payment flow

---

## Phase 3 — Notifications
**Scope:** Fonnte WA integration + templates + auto-cancel cron
**Output:** WA notif end-to-end

### Tasks
- [ ] 3.1 Edge Function: `send-wa-notifications` — Fonnte API call, notif admin + outlet + customer
- [ ] 3.2 Edge Function: `auto-cancel-expired-orders` — pg_cron tiap 1 menit, scan & cancel expired
- [ ] 3.3 Seed notification_templates — 5 templates (new_order_admin, new_order_outlet, paid_customer, ready_customer, cancelled_customer)
- [ ] 3.4 Integrasi notif ke order flow (post-paid trigger)

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
- [x] 5.2 Admin Settings page (`admin/settings.html`) — service_fee, notification templates, app_settings
- [x] 5.3 CSV bulk import outlets — 19 outlet SUKA Shawarma berhasil diimport
- [x] 5.4 CSV bulk import menu — 16 item, 6 kategori berhasil diimport
- [x] 5.5 CSV bulk import outlet_menu_overrides — ready via import.html
- [x] 5.6 Bulk create akun staff — 19 akun outlet staff dibuat via scripts/create-staff-accounts.mjs
- [x] 5.7 Upload foto menu — fitur upload ke Supabase Storage menu-photos bucket

---

## Phase 6 — Reports & PWA
**Scope:** Analytics + Export CSV + PWA installable
**Output:** Owner bisa analisis; karyawan bisa install ke HP

### Tasks
- [ ] 6.1 Admin Reports page (`admin/reports.html`) — revenue per outlet, top menu items, order volume
- [ ] 6.2 Export CSV per outlet per date range
- [ ] 6.3 `manifest.json` + `sw.js` — PWA installable, offline fallback
- [ ] 6.4 Print CSS — struk order untuk printer kasir (optional)

---

## Phase 7 — UAT & Go-Live (sebagian ✅)
**Scope:** Deploy + test + rollout
**Output:** Production live

### Tasks
- [x] 7.1 Deploy frontend ke cPanel `public_html/order/` via Git Version Control
- [x] 7.2 Konfigurasi subdomain `order.sukashawarma.com` — DNS propagasi selesai ✅
- [ ] 7.3 SSL/HTTPS untuk subdomain order
- [ ] 7.4 End-to-end test semua flow (order → admin konfirmasi)
- [ ] 7.5 Fix bugs dari UAT
- [ ] 7.6 Upload foto menu asli semua item
- [ ] 7.7 Training karyawan per outlet

---

## Pending Owner Input
- [ ] Foto menu items (600x600px per item, 16 item)
- [ ] Nomor WA tiap outlet untuk notifikasi pesanan
- [ ] Fonnte API token (untuk WA notifikasi)
- [ ] Logo SUKA Shawarma (SVG/PNG untuk topbar)

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
