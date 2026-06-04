# System Monitoring Dashboard — Design Spec

> Tanggal: 2026-06-04
> Status: Disetujui untuk implementasi
> Ref project: `CLAUDE.md`, `Plans.md`

## 1. Tujuan

Dashboard **kesehatan teknis** sistem SUKA Shawarma Order — bukan laporan penjualan (itu sudah ada di `admin/reports.html`). Fokus: deteksi dini saat ada komponen yang putus/nyangkut **diam-diam**, supaya order tidak gagal tanpa ketahuan.

Prinsip pembagian peran:
- **Dashboard (`admin/monitoring.html`)** → "saat sistem mostly hidup, tunjukkan detailnya."
- **Alert Telegram + UptimeRobot** → "saat sistem mati, kabari saya." (independen dari dashboard)

## 2. Scope

### Yang dipantau (disetujui)
1. **Pembayaran Xendit** — sukses vs gagal vs nyangkut, webhook masuk/tidak
2. **Rekonsiliasi Xendit** — order `PAID` di Xendit tapi masih `pending_payment` di DB (webhook miss)
3. **WA Notif (Fonnte)** — status koneksi **device** (kritikal) + rasio sent/failed
4. **Order Flow** — order nyangkut di status manapun terlalu lama
5. **SLA staff** — order `paid` tapi belum `preparing` > ambang
6. **Layanan eksternal** — ping Supabase, Xendit API, situs customer
7. **Heartbeat pg_cron** — apakah `auto-cancel-expired-orders` & `on-order-done` masih jalan
8. **Nol order di jam buka (13:00–22:00)** — sinyal kegagalan end-to-end
9. **Rasio expired/cancelled melonjak** — proxy friksi checkout
10. **Kapasitas Supabase free-tier** — DB size & storage (cek harian)
11. **Error Edge Function terpusat** — via tabel `system_events`

### Di luar scope (sengaja di-skip — YAGNI)
- Monitoring per-outlet operasional (owner memilih fokus teknis, bukan operasional)
- Brute-force / failed login admin (ditangani Supabase Auth, single owner)
- Refund/chargeback monitoring (terlalu jarang)
- AI verifikasi bukti transfer (sudah deprecated sejak pindah Xendit QRIS, Phase 10/11)

### Akses
- **Super admin only.** RLS existing via `get_my_role() = 'super_admin'`. Outlet staff tidak punya akses.

## 3. Arsitektur

Satu halaman baru: **`admin/monitoring.html`** — vanilla HTML/CSS/JS, Supabase JS SDK dari CDN, reuse `admin.js` (auth guard, realtime helper) + design system existing. Tanpa build step. Konsisten dengan halaman admin lain.

### Layout (atas → bawah)
1. **Status bar — 4 lampu** 🟢/🟡/🔴/⚠️:
   - **Pembayaran** (sukses/gagal/nyangkut + webhook)
   - **WA Notif** (device Fonnte + rasio kirim)
   - **Order Flow** (nyangkut + SLA staff)
   - **Layanan** (Supabase / Xendit / situs customer)
   - ⚠️ abu-abu = "status tidak diketahui" (saat health-check gagal/timeout — degrade dengan anggun, bukan crash)
2. **Kartu metrik** — angka 60 menit & 24 jam (sukses bayar, gagal notif, order nyangkut, expired-rate)
3. **Panel "Butuh Perhatian"** — daftar order nyangkut SEKARANG (pending_payment > 15 mnt, paid-belum-preparing, rekonsiliasi Xendit), tombol ke detail order
4. **Grafik volume jam-an** — deteksi visual nol-order di jam buka
5. **Heartbeat cron** — "terakhir jalan: X menit lalu" per cron job
6. **Kapasitas** — bar % DB & storage (cek harian)
7. **Log alert** — riwayat alert Telegram yang sudah dikirim (dari `system_events`)

## 4. Sumber Data

### Jalur langsung (browser → Supabase, via RLS super_admin)
| Data | Sumber |
|------|--------|
| Order nyangkut, rekonsiliasi target, volume jam-an, expired-rate | `orders` |
| Rasio notif sent/failed | `notification_logs` |
| Error Edge Function | `system_events` (baru) |
| Heartbeat cron | `cron_heartbeat` (baru) |

### Jalur server (browser → Edge Function `system-health-check`)
Untuk data yang butuh secret atau ping eksternal (tidak boleh di browser):
- Status **device Fonnte** (`GET /device` Fonnte API, token rahasia)
- **Rekonsiliasi Xendit** (query Xendit API, bandingkan dengan order `pending_payment`)
- **Ping** Supabase / Xendit / situs customer
- **Kapasitas** Supabase (DB & storage)

Fungsi mengembalikan 1 JSON snapshot; dashboard merender langsung. Dipanggil saat load + interval ringan.

### Realtime
Subscribe Supabase realtime pada `orders` + `system_events` → panel "Butuh Perhatian" & log update otomatis tanpa reload.

## 5. Skema Data Baru

### `system_events` — log error/event terpusat
```sql
CREATE TABLE system_events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source      text NOT NULL,              -- nama Edge Function / 'monitor'
  level       text NOT NULL CHECK (level IN ('info','warn','error')),
  event_type  text NOT NULL,              -- mis. 'ef_error','alert_sent','alert_resolved'
  message     text NOT NULL,
  context     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- RLS: super_admin SELECT; service_role INSERT (Edge Functions)
```
Tiap Edge Function dibungkus `try/catch` → on error tulis 1 baris `level='error'`.

### `cron_heartbeat` — bukti cron masih hidup
```sql
CREATE TABLE cron_heartbeat (
  job_name   text PRIMARY KEY,
  last_run   timestamptz NOT NULL DEFAULT now()
);
-- Tiap cron job UPSERT last_run = now() di akhir eksekusi.
-- Dashboard: now() - last_run > 5 menit → 🔴
```

### `alert_state` — anti-spam alert
```sql
CREATE TABLE alert_state (
  alert_key   text PRIMARY KEY,           -- mis. 'fonnte_disconnect','cron_dead:on-order-done'
  status      text NOT NULL,              -- 'firing' | 'resolved'
  alerted_at  timestamptz,
  resolved_at timestamptz
);
```

## 6. Alert Telegram (M3) & Anti-Spam

Edge Function baru **`system-health-monitor`**, di-trigger pg_cron tiap ~3 menit (pola sama `auto-cancel-expired-orders`):
1. Scan semua anomali (Fonnte disconnect, order nyangkut, cron mati, nol-order di jam buka, EF error baru)
2. **Anti-spam:** cek `alert_state` per `alert_key`. Satu masalah = **satu** alert (`status='firing'`), tidak diulang. Saat pulih → kirim "✅ Pulih", set `status='resolved'`.
3. Kirim ke **Telegram Bot API langsung** (`POST /sendMessage`), token & chat_id dari **Supabase Secrets** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
4. Catat ke `system_events` (`event_type='alert_sent'`) → muncul di panel Log alert

### Ambang batas (disetujui)
- Order `pending_payment` nyangkut: **15 menit**
- Cron dianggap mati: **> 5 menit** tanpa heartbeat
- (Ambang SLA staff & nol-order ditentukan saat implementasi, default wajar; bisa ditaruh di `app_settings`)

## 7. Keamanan

- Semua kredensial di **Supabase Secrets**, tidak pernah di kode/repo: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, Fonnte token, `XENDIT_SECRET_KEY` (sudah ada).
- Token bot Telegram yang dishare owner saat brainstorm **harus di-regenerate via @BotFather (`/revoke`)** sebelum produksi, karena sudah ter-expose di chat. Token lama cukup untuk dev/test.
- `chat_id` tujuan diambil saat M3 (kirim pesan ke bot → `getUpdates`).
- Edge Functions tulis ke `system_events`/`cron_heartbeat`/`alert_state` via `service_role`. Frontend hanya SELECT (super_admin).

## 8. Error Handling

- `system-health-check` gagal/timeout → lampu terkait jadi ⚠️ "tidak diketahui", dashboard tetap render bagian lain. Tidak crash.
- `system-health-monitor` gagal kirim Telegram → catat `level='error'` di `system_events`, retry di siklus cron berikutnya.

## 9. Rencana Bertahap

| Fase | Isi | Hasil |
|------|-----|-------|
| **M1** | Migration (`system_events`, `cron_heartbeat`, `alert_state`) + `admin/monitoring.html` baca Supabase langsung: Order Flow, rasio WA, volume jam-an, panel nyangkut, heartbeat cron. Tambah UPSERT heartbeat ke cron existing. | Dashboard inti langsung dipakai |
| **M2** | Edge Function `system-health-check` → 4 lampu lengkap (device Fonnte, rekonsiliasi Xendit, ping layanan, kapasitas) + realtime subscribe | Lampu akurat |
| **M3** | Edge Function `system-health-monitor` + pg_cron + anti-spam + alert Telegram + log | Alert otomatis aktif |

## 10. Setup Manual di Luar Kode (untuk owner)

1. **UptimeRobot** (gratis, ~5 menit) — monitor eksternal benar-benar terpisah. Tambah HTTP monitor untuk `https://order.sukashawarma.com`, integrasikan Telegram. Inilah satu-satunya layer yang tahu kalau seluruh Hostinger/Supabase tumbang.
2. **Telegram** — siapkan bot (@BotFather), ambil `chat_id`, isi Supabase Secrets saat M3.
3. **Fonnte** — pastikan API token tersedia di Supabase Secrets untuk cek device.

## 11. Testing

- Unit/manual: simulasikan tiap anomali (set order ke pending_payment lampau, matikan heartbeat, paksa notif failed) → pastikan lampu & panel bereaksi benar.
- Anti-spam: picu 1 masalah berkelanjutan → pastikan hanya 1 alert terkirim, lalu "pulih" saat resolved.
- Degrade: matikan `system-health-check` → pastikan dashboard tetap render dengan ⚠️.
