# SUKA Shawarma — Online Order System

## Project Overview
Website pesanan online pickup untuk 19 outlet SUKA Shawarma di subdomain `order.sukshawarma.com`.
Dibangun terpisah dari WordPress utama (`sukshawarma.com`).

**Spec:** `docs/superpowers/specs/2026-05-19-sukshawarma-order-design.md`
**Mockup:** `mockup.html`

## Stack
- **Frontend:** Vanilla HTML/CSS/JS — no framework, no build step
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions/Deno)
- **Payment:** Xendit (QRIS dinamis Indonesia, auto-confirm via webhook)
- **Notifications:** Fonnte (WhatsApp gateway)
- **Hosting:** Hostinger — static files di `/public_html/order/`

## Folder Structure (Target)
```
/ (project root)
├── index.html          — Home: pilih outlet
├── menu.html           — Menu outlet + cart
├── checkout.html       — Checkout single page
├── order.html          — Status order (post-payment)
├── admin/              — Admin panel pages
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
├── supabase/
│   ├── migrations/     — SQL schema files
│   └── functions/      — Edge Functions (Deno)
│       ├── create-xendit-payment/
│       ├── xendit-webhook/
│       ├── send-wa-notifications/
│       ├── check-xendit-status/
│       └── auto-cancel-expired-orders/
├── manifest.json
├── sw.js               — Service Worker (PWA)
├── robots.txt
├── mockup.html         — Design mockup
├── CLAUDE.md
├── Plans.md
└── docs/
    └── superpowers/specs/2026-05-19-sukshawarma-order-design.md
```

## Key Architecture Decisions
- D1: Subdomain (not WP page) — zero conflict, < 100kb
- D2: Vanilla JS — ringan, no build tooling
- D3: Supabase — familiar, free tier cukup
- D4: Xendit — QRIS dinamis Indonesia, auto-confirm, webhook reliable, akun dibuat baru
- D5: Fonnte WA — murah, komunitas besar Indonesia
- D6: 2 roles: super_admin + outlet_staff (RLS enforced)
- D7: Shared menu + outlet_menu_overrides per outlet
- D8: 1 Xendit account pusat (business_id tunggal)
- D9: Service fee pass-through ke customer
- D13: Pickup only (no delivery, no dine-in, no customer login)

## Security Requirements (WAJIB)
- Xendit webhook: verify `x-callback-token` header (bukan HMAC, tapi token statis dari dashboard)
- Idempotency check pada webhook handler (gunakan `payment_id` dari Xendit)
- Amount verification di webhook: bandingkan `request_amount` vs server price
- Server-side price recalculation (ignore client prices)
- Rate limit: 10 req/min per IP untuk create-xendit-payment
- Semua credentials di Supabase Secrets, bukan di kode (XENDIT_SECRET_KEY, XENDIT_CALLBACK_TOKEN)

## Coding Conventions
- Semua komentar & log dalam Bahasa Indonesia
- Gunakan ES6+ tapi tidak perlu transpile (modern browser target)
- Supabase JS SDK dari CDN (tidak npm)
- Tidak ada framework CSS — custom CSS saja
- Cart state: localStorage key `suka_cart_{outlet_slug}`
- Invoke `frontend-design` skill untuk implementasi UI

## MVP Phases
Lihat Plans.md untuk breakdown per phase dan task tracking.
