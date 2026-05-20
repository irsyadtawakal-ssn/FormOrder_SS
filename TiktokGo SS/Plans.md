# Plans — SUKA Shawarma Order System

> Ref spec: `docs/superpowers/specs/2026-05-19-sukshawarma-order-design.md`
> Status: Phase 1 ✅ SELESAI — Phase 2 berikutnya

---

## Phase 1 — Foundation ✅
**Scope:** Supabase schema + RLS + seed data + Frontend home + menu
**Output:** Customer bisa browse menu di subdomain

### Tasks
- [x] 1.1 Supabase schema SQL — semua tabel (outlets, categories, menu_items, menu_variants, menu_variant_options, outlet_menu_overrides, orders, order_items, admin_users, notification_logs, notification_templates, app_settings)
- [x] 1.2 RLS policies — semua tabel sesuai spec §4.2
- [x] 1.3 Storage buckets — menu-photos, logos, csv-imports (SQL + instruksi)
- [x] 1.4 Seed data — 2 sample outlet + menu items + variants lengkap
- [x] 1.5 Home page (`index.html`) — outlet list + GPS auto-detect + search + chip filter
- [x] 1.6 Menu page (`menu.html`) — categories tabs + search + item bottom sheet + cart bar
- [x] 1.7 `assets/js/supabase.js` — Supabase client singleton
- [x] 1.8 `assets/js/utils.js` — helpers (haversine, formatRupiah, WA validation, localStorage cart)
- [x] 1.9 `assets/css/style.css` — design system, komponen shared

---

## Phase 2 — Checkout & Payment
**Scope:** Checkout + Tripay integration + webhook + status page
**Output:** E2E payment flow dengan Tripay sandbox

### Tasks
- [x] 2.1 Edge Function: `create-tripay-payment` — validate + server-side reprice + INSERT orders + call Tripay + return QRIS
- [x] 2.2 Edge Function: `tripay-webhook` — verify HMAC + idempotency + amount check + UPDATE order status
- [x] 2.3 Edge Function: `check-tripay-status` — fallback polling Tripay API
- [x] 2.4 Checkout page (`checkout.html`) — outlet confirm + order summary + form + service fee + bayar
- [x] 2.5 Order status page (`order.html`) — adaptive view per status + realtime subscribe + QR countdown
- [x] 2.6 `assets/js/app.js` — cart logic, checkout submit, payment redirect

---

## Phase 3 — Notifications
**Scope:** Fonnte WA integration + templates + auto-cancel cron
**Output:** WA notif end-to-end

### Tasks
- [ ] 3.1 Edge Function: `send-wa-notifications` — Fonnte API call, notif admin + outlet + customer
- [ ] 3.2 Edge Function: `auto-cancel-expired-orders` — pg_cron tiap 1 menit, scan & cancel expired
- [ ] 3.3 Seed notification_templates — 5 templates (new_order_admin, new_order_outlet, paid_customer, ready_customer, cancelled_customer)
- [ ] 3.4 Integrasi notif ke webhook flow (post-paid trigger)

---

## Phase 4 — Admin Panel Core
**Scope:** Auth + Orders page (realtime) + Menu CRUD + Outlet CRUD
**Output:** Admin bisa manage operations via HP

### Tasks
- [x] 4.1 Admin auth — login page, session check, redirect guard
- [x] 4.2 Admin Dashboard (`admin/index.html`) — summary cards: orders hari ini, revenue, outlet count
- [x] 4.3 Admin Orders page (`admin/orders.html`) — realtime list, status workflow 1-tap, sound notif, filter per outlet (outlet_staff filter)
- [x] 4.4 Admin Menu CRUD (`admin/menu.html`) — create/edit/toggle menu items, variants, options
- [x] 4.5 Admin Outlets CRUD (`admin/outlets.html`) — super_admin only, create/edit/toggle outlets, outlet_menu_overrides
- [x] 4.6 `assets/js/admin.js` — shared admin utilities, auth check, realtime helpers

---

## Phase 5 — Bulk Import & Settings
**Scope:** CSV import + User management + App settings
**Output:** Admin bisa onboard 19 outlet sekaligus

### Tasks
- [ ] 5.1 Admin Users page (`admin/users.html`) — super_admin only, create/edit outlet_staff accounts
- [ ] 5.2 Admin Settings page (`admin/settings.html`) — service_fee_percent toggle, notification templates editor, app_settings CRUD
- [ ] 5.3 CSV bulk import — outlets (nama, alamat, koordinat, WA, jam, type)
- [ ] 5.4 CSV bulk import — menu items + variants + options
- [ ] 5.5 CSV bulk import — outlet_menu_overrides (harga + stok per outlet)
- [ ] 5.6 Upload & preview storage (`csv-imports` bucket) sebelum apply

---

## Phase 6 — Reports & PWA
**Scope:** Analytics + Export CSV + PWA installable + Print CSS
**Output:** Owner bisa analisis; karyawan bisa install ke HP

### Tasks
- [ ] 6.1 Admin Reports page (`admin/reports.html`) — revenue per outlet, top menu items, order volume chart
- [ ] 6.2 Export CSV per outlet per date range
- [ ] 6.3 `manifest.json` + `sw.js` — PWA installable, offline fallback halaman statis
- [ ] 6.4 Print CSS — struk order untuk printer kasir (optional)

---

## Phase 7 — UAT & Go-Live
**Scope:** Pilot 1 outlet → fix → rollout → training
**Output:** Production live

### Tasks
- [ ] 7.1 Deploy ke Supabase production (bukan sandbox)
- [ ] 7.2 Deploy frontend ke Hostinger `/public_html/order/`
- [ ] 7.3 Konfigurasi subdomain + SSL
- [ ] 7.4 End-to-end test 1 outlet pilot
- [ ] 7.5 Fix bugs dari UAT
- [ ] 7.6 Rollout ke semua 19 outlet
- [ ] 7.7 Training karyawan (video singkat + panduan singkat)

---

## Pending Owner Input (Blockers)
- [ ] Data 19 outlet (nama, alamat, koordinat, no WA, jam, type owned/partner)
- [ ] Logo & brand assets (SVG/PNG, brand colors, mood preferensi)
- [ ] Foto menu items (atau pakai placeholder)
- [ ] Admin pusat no WA untuk notifikasi
- [ ] Fonnte API token (setelah akun dibuat)
- [ ] Supabase project URL + anon key (setelah project dibuat)
- [ ] Tripay API key, private key, merchant code (akun sudah ada)

---

## Completed
_(kosong — belum mulai)_
