# System Monitoring Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun dashboard kesehatan teknis (`admin/monitoring.html`) untuk SUKA Shawarma Order — deteksi dini saat pembayaran, WA notif, order flow, atau layanan eksternal bermasalah — plus alert Telegram otomatis dengan anti-spam.

**Architecture:** Vanilla HTML/CSS/JS + Supabase. Data dibaca 2 jalur: langsung dari Supabase (orders, notification_logs, tabel baru) untuk yang aman via RLS super_admin, dan via Edge Function `system-health-check` untuk yang butuh secret/ping eksternal. Alert dikirim Edge Function `system-health-monitor` (pg_cron tiap ~3 mnt) ke Telegram Bot API langsung, dengan dedup via tabel `alert_state`.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions Deno + pg_cron), Telegram Bot API, Fonnte API, Xendit API, Supabase JS SDK (CDN).

**Ref spec:** `docs/superpowers/specs/2026-06-04-system-monitoring-dashboard-design.md`

**Catatan testing:** Project tanpa test framework (vanilla, no build). "Verifikasi" = jalankan SQL di Supabase SQL Editor + cek di browser. Setiap task tetap punya langkah verifikasi konkret + commit.

---

## File Structure

**Buat baru:**
- `supabase/migrations/20260604_monitoring.sql` — tabel `system_events`, `cron_heartbeat`, `alert_state` + RLS + index
- `admin/monitoring.html` — halaman dashboard (super_admin only)
- `assets/js/monitoring.js` — logika dashboard (query, render lampu/panel, realtime)
- `supabase/functions/system-health-check/index.ts` — snapshot status (Fonnte device, rekonsiliasi Xendit, ping, kapasitas)
- `supabase/functions/system-health-monitor/index.ts` — scan anomali + anti-spam + kirim Telegram
- `supabase/migrations/20260604_monitor_cron.sql` — jadwal pg_cron untuk `system-health-monitor`

**Modifikasi:**
- `supabase/functions/auto-cancel-expired-orders/index.ts` — tambah UPSERT heartbeat di akhir
- `supabase/functions/on-order-done/index.ts` — tambah UPSERT heartbeat di akhir
- `admin/index.html` (atau file nav sidebar admin) — tambah link menu "Monitoring" (admin-only)

---

## FASE M1 — Dashboard Inti (baca Supabase langsung)

### Task 1: Migration tabel monitoring

**Files:**
- Create: `supabase/migrations/20260604_monitoring.sql`

- [ ] **Step 1: Tulis migration SQL**

```sql
-- 20260604_monitoring.sql — Tabel pendukung dashboard monitoring sistem

-- ─── system_events: log error/event terpusat ─────────────────────────────────
CREATE TABLE IF NOT EXISTS system_events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source      text NOT NULL,
  level       text NOT NULL CHECK (level IN ('info','warn','error')),
  event_type  text NOT NULL,
  message     text NOT NULL,
  context     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);

-- ─── cron_heartbeat: bukti cron masih hidup ───────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_heartbeat (
  job_name  text PRIMARY KEY,
  last_run  timestamptz NOT NULL DEFAULT now()
);

-- ─── alert_state: anti-spam alert ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_state (
  alert_key   text PRIMARY KEY,
  status      text NOT NULL CHECK (status IN ('firing','resolved')),
  alerted_at  timestamptz,
  resolved_at timestamptz
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE system_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_state    ENABLE ROW LEVEL SECURITY;

-- super_admin boleh SELECT semua; INSERT/UPDATE hanya service_role (bypass RLS)
CREATE POLICY "system_events_admin_select" ON system_events
  FOR SELECT TO authenticated USING (get_my_role() = 'super_admin');
CREATE POLICY "cron_heartbeat_admin_select" ON cron_heartbeat
  FOR SELECT TO authenticated USING (get_my_role() = 'super_admin');
CREATE POLICY "alert_state_admin_select" ON alert_state
  FOR SELECT TO authenticated USING (get_my_role() = 'super_admin');
```

- [ ] **Step 2: Jalankan & verifikasi di Supabase SQL Editor**

Paste isi file ke SQL Editor → Run. Lalu verifikasi:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('system_events','cron_heartbeat','alert_state');
```
Expected: 3 baris muncul.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260604_monitoring.sql
git commit -m "Migration: tabel monitoring (system_events, cron_heartbeat, alert_state)"
```

---

### Task 2: Heartbeat di cron existing

**Files:**
- Modify: `supabase/functions/auto-cancel-expired-orders/index.ts` (sebelum `return Response.json` terakhir)
- Modify: `supabase/functions/on-order-done/index.ts` (sebelum return sukses)

- [ ] **Step 1: Tambah UPSERT heartbeat di `auto-cancel-expired-orders`**

Sebelum `return Response.json({...})` paling akhir (baris ~87), sisipkan:
```ts
  // Catat heartbeat — bukti cron masih hidup
  await db.from("cron_heartbeat").upsert(
    { job_name: "auto-cancel-expired-orders", last_run: new Date().toISOString() },
    { onConflict: "job_name" },
  );
```
Catatan: blok early-return saat `expired_count: 0` (baris ~45) juga harus menulis heartbeat. Tambahkan UPSERT yang sama sebelum return tersebut.

- [ ] **Step 2: Tambah UPSERT heartbeat di `on-order-done`**

Sebelum return sukses fungsi, sisipkan blok UPSERT serupa dengan `job_name: "on-order-done"`. Pastikan variabel client Supabase di file itu (cek nama, kemungkinan `db` atau `supabase`) dipakai konsisten.

- [ ] **Step 3: Deploy kedua function**

```bash
supabase functions deploy auto-cancel-expired-orders
supabase functions deploy on-order-done
```

- [ ] **Step 4: Verifikasi heartbeat tercatat**

Tunggu ≤1 menit (auto-cancel jalan tiap menit), lalu di SQL Editor:
```sql
SELECT * FROM cron_heartbeat;
```
Expected: minimal 1 baris `auto-cancel-expired-orders` dengan `last_run` baru saja.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/auto-cancel-expired-orders/index.ts supabase/functions/on-order-done/index.ts
git commit -m "Monitoring: cron existing tulis heartbeat ke cron_heartbeat"
```

---

### Task 3: Kerangka halaman monitoring + auth guard

**Files:**
- Create: `admin/monitoring.html`
- Create: `assets/js/monitoring.js`

- [ ] **Step 1: Buat `admin/monitoring.html`**

Salin kerangka head/topbar/sidebar dari `admin/index.html` (agar konsisten), ganti judul jadi "Monitoring Sistem", dan isi body dengan kontainer kosong. Pastikan urutan script di akhir body:
```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="../assets/js/supabase.js"></script>
  <script src="../assets/js/utils.js"></script>
  <script src="../assets/js/admin.js"></script>
  <script src="../assets/js/monitoring.js"></script>
```
Struktur kontainer di dalam `#pageContent`:
```html
<div id="statusBar" class="status-bar"></div>
<div id="metricCards" class="stat-grid"></div>
<section><h3>Butuh Perhatian</h3><div id="attentionPanel"></div></section>
<section><h3>Volume Order per Jam</h3><div id="volumeChart"></div></section>
<section><h3>Heartbeat Cron</h3><div id="cronPanel"></div></section>
<section class="admin-only"><h3>Kapasitas</h3><div id="capacityPanel"></div></section>
<section><h3>Log Alert</h3><div id="alertLog"></div></section>
```

- [ ] **Step 2: Buat `assets/js/monitoring.js` dengan guard**

```js
// assets/js/monitoring.js — Dashboard monitoring kesehatan sistem (super_admin)
let _monUser = null;

async function initMonitoring() {
  _monUser = await requireSuperAdmin(); // redirect kalau bukan super_admin
  if (!_monUser) return;
  await refreshAll();
}

async function refreshAll() {
  // diisi di task berikutnya
  console.log('monitoring: refreshAll');
}

document.addEventListener('DOMContentLoaded', initMonitoring);
```

- [ ] **Step 3: Verifikasi guard di browser**

Buka `admin/monitoring.html` sebagai super_admin → halaman tampil, console log `monitoring: refreshAll`. Login sebagai outlet_staff → ter-redirect ke `index.html`.

- [ ] **Step 4: Commit**

```bash
git add admin/monitoring.html assets/js/monitoring.js
git commit -m "Monitoring: kerangka halaman + auth guard super_admin"
```

---

### Task 4: Panel Order Flow + "Butuh Perhatian"

**Files:**
- Modify: `assets/js/monitoring.js`

- [ ] **Step 1: Query order nyangkut & render panel**

Ganti isi `refreshAll` dan tambah fungsi berikut. Ambang: `pending_payment` > 15 menit; `paid` belum `preparing` > 20 menit.
```js
const STUCK_PENDING_MIN = 15;
const STUCK_PAID_MIN = 20;

async function loadAttention() {
  const now = Date.now();
  const pendingCut = new Date(now - STUCK_PENDING_MIN * 60000).toISOString();
  const paidCut = new Date(now - STUCK_PAID_MIN * 60000).toISOString();

  const { data: pending } = await window.db.from('orders')
    .select('id, order_number, status, created_at, customer_name, outlets(name)')
    .eq('status', 'pending_payment').lt('created_at', pendingCut);

  const { data: paidStuck } = await window.db.from('orders')
    .select('id, order_number, status, paid_at, customer_name, outlets(name)')
    .eq('status', 'paid').lt('paid_at', paidCut);

  const rows = [...(pending || []), ...(paidStuck || [])];
  const el = document.getElementById('attentionPanel');
  if (!rows.length) { el.innerHTML = '<p class="muted">✅ Tidak ada order nyangkut</p>'; return rows; }
  el.innerHTML = rows.map(o => `
    <a class="attention-row" href="orders.html?order=${o.id}">
      <strong>${o.order_number}</strong> — ${o.status}
      <span>${(o.outlets?.name) || ''} · ${o.customer_name || ''}</span>
    </a>`).join('');
  return rows;
}
```
Catatan: verifikasi nama kolom `paid_at` ada di tabel `orders` (cek `001_schema.sql`). Jika tidak ada, pakai `updated_at` sebagai proxy dan beri komentar.

- [ ] **Step 2: Panggil dari `refreshAll`**

```js
async function refreshAll() {
  await loadAttention();
}
```

- [ ] **Step 3: Verifikasi**

Di SQL Editor, set 1 order test jadi nyangkut:
```sql
UPDATE orders SET status='pending_payment', created_at = now() - interval '30 min'
WHERE id = (SELECT id FROM orders LIMIT 1);
```
Reload dashboard → order muncul di panel "Butuh Perhatian". Kembalikan data test setelah cek.

- [ ] **Step 4: Commit**

```bash
git add assets/js/monitoring.js
git commit -m "Monitoring: panel order nyangkut (pending & paid-stuck)"
```

---

### Task 5: Kartu metrik (60 mnt / 24 jam)

**Files:**
- Modify: `assets/js/monitoring.js`

- [ ] **Step 1: Hitung & render metrik**

```js
async function loadMetrics() {
  const h1 = new Date(Date.now() - 3600000).toISOString();
  const h24 = new Date(Date.now() - 86400000).toISOString();

  const paid24 = await window.db.from('orders').select('id', { count: 'exact', head: true })
    .in('status', ['paid','preparing','ready','done']).gte('created_at', h24);
  const expired24 = await window.db.from('orders').select('id', { count: 'exact', head: true })
    .in('status', ['expired','cancelled']).gte('created_at', h24);
  const notifFail1 = await window.db.from('notification_logs').select('id', { count: 'exact', head: true })
    .eq('status', 'failed').gte('sent_at', h1);

  const cards = [
    { label: 'Order Bayar (24j)', value: paid24.count ?? 0 },
    { label: 'Expired/Batal (24j)', value: expired24.count ?? 0 },
    { label: 'Notif Gagal (60m)', value: notifFail1.count ?? 0 },
  ];
  document.getElementById('metricCards').innerHTML = cards.map(c =>
    `<div class="stat-card"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>`
  ).join('');
}
```

- [ ] **Step 2: Panggil dari `refreshAll`** (tambah `await loadMetrics();`)

- [ ] **Step 3: Verifikasi** — reload dashboard, 3 kartu tampil angka. Bandingkan "Order Bayar (24j)" dengan query manual `SELECT count(*) FROM orders WHERE status IN ('paid','preparing','ready','done') AND created_at >= now()-interval '24 hour';`

- [ ] **Step 4: Commit**

```bash
git add assets/js/monitoring.js
git commit -m "Monitoring: kartu metrik 60m/24j"
```

---

### Task 6: Lampu Order Flow & WA (dari data langsung)

**Files:**
- Modify: `assets/js/monitoring.js`

- [ ] **Step 1: Hitung status lampu & render**

Lampu dari data langsung dulu (Pembayaran & Layanan jadi ⚠️ "menunggu health-check" sampai M2).
```js
function lamp(state) { return ({green:'🟢',yellow:'🟡',red:'🔴',gray:'⚠️'})[state]; }

async function loadStatusBar(attentionRows, notifFailCount) {
  const orderFlow = !attentionRows.length ? 'green' : (attentionRows.length > 3 ? 'red' : 'yellow');
  const wa = notifFailCount === 0 ? 'green' : (notifFailCount > 3 ? 'red' : 'yellow');
  const lamps = [
    { k: 'Pembayaran', s: 'gray' },
    { k: 'WA Notif', s: wa },
    { k: 'Order Flow', s: orderFlow },
    { k: 'Layanan', s: 'gray' },
  ];
  document.getElementById('statusBar').innerHTML = lamps.map(l =>
    `<div class="lamp"><span class="lamp-icon">${lamp(l.s)}</span><span>${l.k}</span></div>`
  ).join('');
}
```

- [ ] **Step 2: Wire ke `refreshAll`** — kumpulkan return `loadAttention()` & jumlah notif gagal lalu panggil `loadStatusBar`.

- [ ] **Step 3: Verifikasi** — reload, status bar tampil 4 lampu; Order Flow hijau saat tidak ada nyangkut, kuning/merah saat ada (pakai trik UPDATE test Task 4).

- [ ] **Step 4: Commit**

```bash
git add assets/js/monitoring.js
git commit -m "Monitoring: status bar 4 lampu (Order Flow & WA dari data langsung)"
```

---

### Task 7: Volume order per jam + heartbeat cron

**Files:**
- Modify: `assets/js/monitoring.js`

- [ ] **Step 1: Render volume per jam (bar sederhana CSS, tanpa lib)**

```js
async function loadVolume() {
  const since = new Date(Date.now() - 12 * 3600000).toISOString();
  const { data } = await window.db.from('orders').select('created_at').gte('created_at', since);
  const buckets = {};
  (data || []).forEach(o => { const h = new Date(o.created_at).getHours(); buckets[h] = (buckets[h]||0)+1; });
  const max = Math.max(1, ...Object.values(buckets));
  const hours = Array.from({length:12}, (_,i) => (new Date().getHours()-11+i+24)%24);
  document.getElementById('volumeChart').innerHTML = hours.map(h => {
    const v = buckets[h] || 0;
    const open = h >= 13 && h <= 22;
    const zero = open && v === 0;
    return `<div class="bar-col"><div class="bar ${zero?'bar-zero':''}" style="height:${(v/max)*60}px"></div><small>${h}</small></div>`;
  }).join('');
}
```

- [ ] **Step 2: Render heartbeat cron**

```js
async function loadCron() {
  const { data } = await window.db.from('cron_heartbeat').select('*');
  const el = document.getElementById('cronPanel');
  if (!data || !data.length) { el.innerHTML = '<p class="muted">Belum ada heartbeat</p>'; return; }
  el.innerHTML = data.map(c => {
    const ageMin = (Date.now() - new Date(c.last_run).getTime()) / 60000;
    const dead = ageMin > 5;
    return `<div class="cron-row">${dead?'🔴':'🟢'} <strong>${c.job_name}</strong> — ${fmtTimeAgo(c.last_run)}</div>`;
  }).join('');
}
```

- [ ] **Step 3: Wire ke `refreshAll`** (tambah `await loadVolume(); await loadCron();`)

- [ ] **Step 4: Verifikasi** — reload; grafik 12 bar tampil, jam buka tanpa order tersorot merah; panel cron tampil `auto-cancel-expired-orders` hijau.

- [ ] **Step 5: Commit**

```bash
git add assets/js/monitoring.js
git commit -m "Monitoring: volume per jam + heartbeat cron"
```

---

### Task 8: CSS + link navigasi + bump SW cache

**Files:**
- Modify: `assets/css/style.css` (atau `<style>` di monitoring.html — ikuti pola halaman lain)
- Modify: `admin/index.html` (sidebar nav, item admin-only)
- Modify: `sw.js` (bump versi cache + tambah `monitoring.html`/`monitoring.js` ke daftar aset)

- [ ] **Step 1: Tambah CSS** untuk `.status-bar`, `.lamp`, `.attention-row`, `.bar-col`, `.bar`, `.bar-zero`, `.cron-row`. Ikuti palet design system (var `--brand`, dll). Buat ringkas, mobile-first.

- [ ] **Step 2: Tambah link nav** di sidebar `admin/index.html` (dan halaman admin lain jika nav di-hardcode per halaman):
```html
<a href="monitoring.html" class="nav-item admin-only">📊 Monitoring</a>
```

- [ ] **Step 3: Bump SW cache** — naikkan nomor versi cache di `sw.js` (ikuti pola `v6`→`v7`) dan tambahkan path baru.

- [ ] **Step 4: Verifikasi** — reload, dashboard rapi di mobile & desktop; link Monitoring muncul untuk super_admin, hilang untuk staff.

- [ ] **Step 5: Commit**

```bash
git add assets/css/style.css admin/index.html sw.js
git commit -m "Monitoring: styling, link nav admin-only, bump SW cache"
```

**🚩 Checkpoint M1:** Dashboard inti berfungsi dan dapat dipakai. Lampu Pembayaran & Layanan masih ⚠️ (menunggu M2).

---

## FASE M2 — Edge Function `system-health-check` (lampu akurat)

### Task 9: Edge Function snapshot status

**Files:**
- Create: `supabase/functions/system-health-check/index.ts`

- [ ] **Step 1: Tulis fungsi** — auth via JWT super_admin (panggilan dari browser admin), kembalikan JSON snapshot. Verifikasi pemanggil: cek header Authorization berisi access token user dengan role super_admin (query `admin_users`). Konten:
```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL = Deno.env.get("SUPABASE_URL")!, SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FONNTE = Deno.env.get("FONNTE_TOKEN"), XENDIT = Deno.env.get("XENDIT_SECRET_KEY");

  // Verifikasi pemanggil super_admin
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userClient = createClient(URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  const db = createClient(URL, SRV, { auth: { persistSession: false } });
  const { data: prof } = await db.from("admin_users").select("role").eq("id", user.id).single();
  if (prof?.role !== "super_admin") return Response.json({ error: "Forbidden" }, { status: 403, headers: CORS });

  const snap: Record<string, unknown> = { checked_at: new Date().toISOString() };

  // Fonnte device
  if (FONNTE) {
    try {
      const r = await fetch("https://api.fonnte.com/device", { method: "POST", headers: { Authorization: FONNTE } });
      const j = await r.json();
      snap.fonnte = { connected: j?.device_status === "connect" || j?.status === true, raw: j?.device_status ?? null };
    } catch (e) { snap.fonnte = { connected: null, error: String(e) }; }
  }

  // Ping eksternal (situs customer + xendit)
  snap.ping = {};
  for (const [k, url] of [["site", "https://order.sukashawarma.com"], ["xendit", "https://api.xendit.co"]]) {
    try { const t0 = Date.now(); const r = await fetch(url, { method: "HEAD" }); (snap.ping as any)[k] = { ok: r.status < 500, ms: Date.now() - t0 }; }
    catch (e) { (snap.ping as any)[k] = { ok: false, error: String(e) }; }
  }

  // Rekonsiliasi Xendit: order pending_payment lama yang mungkin sudah PAID di Xendit
  // (cek via payment_id bila ada — implementasi detail di Task 10)
  snap.reconcile = { stale_pending: 0 };

  return Response.json(snap, { headers: CORS });
});
```

- [ ] **Step 2: Deploy** — `supabase functions deploy system-health-check`

- [ ] **Step 3: Verifikasi** — panggil dari browser console saat login super_admin:
```js
const { data:{ session } } = await window.db.auth.getSession();
const r = await fetch(`${window.SUKA_CONFIG.supabaseUrl}/functions/v1/system-health-check`, { headers:{ Authorization:`Bearer ${session.access_token}` }});
console.log(await r.json());
```
Expected: JSON berisi `fonnte`, `ping`, `reconcile`. (Sesuaikan `window.SUKA_CONFIG.supabaseUrl` dengan konstanta di `supabase.js`.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/system-health-check/index.ts
git commit -m "Monitoring: Edge Function system-health-check (Fonnte device, ping, rekonsiliasi)"
```

---

### Task 10: Rekonsiliasi Xendit di health-check

**Files:**
- Modify: `supabase/functions/system-health-check/index.ts`

- [ ] **Step 1: Implementasi cek rekonsiliasi** — Ganti blok `snap.reconcile`. Ambil order `pending_payment` > 15 menit yang punya `payment_id` (atau kolom Xendit id — verifikasi nama kolom di migrasi Xendit, mis. `xendit_payment_request_id`). Untuk tiap order, GET status ke Xendit; hitung yang sudah `SUCCEEDED`/`PAID`.
```ts
  const cut = new Date(Date.now() - 15*60000).toISOString();
  // CATATAN: id payment_request Xendit disimpan di kolom `tripay_reference` (di-reuse dari era Tripay)
  const { data: stale } = await db.from("orders")
    .select("id, order_number, tripay_reference")
    .eq("status", "pending_payment").lt("created_at", cut)
    .not("tripay_reference", "is", null);
  let mismatched: string[] = [];
  if (XENDIT && stale) {
    for (const o of stale) {
      try {
        const r = await fetch(`https://api.xendit.co/payment_requests/${o.tripay_reference}`,
          { headers: { Authorization: "Basic " + btoa(XENDIT + ":") } });
        const j = await r.json();
        if (["SUCCEEDED","PAID","COMPLETED"].includes(j?.status)) mismatched.push(o.order_number);
      } catch { /* abaikan per-order */ }
    }
  }
  snap.reconcile = { stale_pending: stale?.length ?? 0, paid_but_unsynced: mismatched };
```
Catatan: kolom id Xendit = `tripay_reference` (sudah diverifikasi di `create-xendit-payment/index.ts:503`). Endpoint Payment Requests API benar (bukan Invoice).

- [ ] **Step 2: Deploy & verifikasi** — `supabase functions deploy system-health-check`; panggil ulang dari console, pastikan `reconcile.paid_but_unsynced` array (kosong jika tidak ada mismatch).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/system-health-check/index.ts
git commit -m "Monitoring: rekonsiliasi Xendit (paid tapi belum tersinkron)"
```

---

### Task 11: Konsumsi health-check di dashboard + realtime

**Files:**
- Modify: `assets/js/monitoring.js`

- [ ] **Step 1: Panggil health-check & update lampu Pembayaran + Layanan**

```js
async function loadHealthCheck() {
  try {
    const { data:{ session } } = await window.db.auth.getSession();
    const r = await fetch(`${window.SUKA_CONFIG.supabaseUrl}/functions/v1/system-health-check`,
      { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!r.ok) throw new Error('health-check ' + r.status);
    return await r.json();
  } catch (e) { console.warn('health-check gagal', e); return null; }
}

function lampFromHealth(snap) {
  if (!snap) return { pembayaran: 'gray', layanan: 'gray', wa_device: 'gray' };
  const recon = snap.reconcile || {};
  const pembayaran = (recon.paid_but_unsynced?.length) ? 'red' : 'green';
  const pingOk = snap.ping?.site?.ok && snap.ping?.xendit?.ok;
  const layanan = pingOk ? 'green' : 'red';
  const wa_device = snap.fonnte?.connected === false ? 'red' : (snap.fonnte?.connected ? 'green' : 'gray');
  return { pembayaran, layanan, wa_device };
}
```

- [ ] **Step 2: Integrasi ke `loadStatusBar`** — terima hasil `lampFromHealth`, set lampu Pembayaran & Layanan; gabungkan `wa_device` dengan rasio notif (merah jika salah satu merah).

- [ ] **Step 3: Realtime subscribe** — di `initMonitoring`, setelah refresh pertama:
```js
window.db.channel('mon-orders')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refreshAll())
  .subscribe();
window.db.channel('mon-events')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_events' }, () => loadAlertLog())
  .subscribe();
```

- [ ] **Step 4: Verifikasi** — reload; lampu Pembayaran & Layanan jadi hijau (bukan ⚠️). Matikan koneksi (atau set `xendit_payment_request_id` palsu) untuk lihat reaksi. Ubah 1 order via SQL → panel update otomatis tanpa reload.

- [ ] **Step 5: Commit**

```bash
git add assets/js/monitoring.js
git commit -m "Monitoring: konsumsi health-check (lampu Pembayaran/Layanan) + realtime"
```

**🚩 Checkpoint M2:** 4 lampu akurat, realtime aktif.

---

## FASE M3 — Alert Telegram otomatis

### Task 12: Edge Function `system-health-monitor` + anti-spam

**Files:**
- Create: `supabase/functions/system-health-monitor/index.ts`

- [ ] **Step 1: Tulis fungsi** — dipanggil pg_cron (auth service_role, pola sama `auto-cancel-expired-orders`). Logika: scan anomali → bandingkan dengan `alert_state` → kirim Telegram untuk yang baru `firing` / `resolved`.
```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

async function tg(token: string, chat: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "Markdown" }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL = Deno.env.get("SUPABASE_URL")!, SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!, TG_CHAT = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (auth !== SRV) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  const db = createClient(URL, SRV, { auth: { persistSession: false } });

  const issues: { key: string; msg: string }[] = [];

  // 1. Order nyangkut pending_payment > 15 mnt
  const cut = new Date(Date.now() - 15*60000).toISOString();
  const { count: stuckCount } = await db.from("orders").select("id", { count: "exact", head: true })
    .eq("status", "pending_payment").lt("created_at", cut);
  if ((stuckCount ?? 0) > 0) issues.push({ key: "stuck_pending", msg: `⚠️ ${stuckCount} order nyangkut belum bayar > 15 menit` });

  // 2. Cron mati > 5 mnt
  const { data: hb } = await db.from("cron_heartbeat").select("*");
  for (const c of hb ?? []) {
    if ((Date.now() - new Date(c.last_run).getTime()) / 60000 > 5)
      issues.push({ key: `cron_dead:${c.job_name}`, msg: `🔴 Cron *${c.job_name}* tidak jalan > 5 menit` });
  }

  // 3. Notif gagal banyak (60 mnt)
  const h1 = new Date(Date.now() - 3600000).toISOString();
  const { count: failCount } = await db.from("notification_logs").select("id", { count: "exact", head: true })
    .eq("status", "failed").gte("sent_at", h1);
  if ((failCount ?? 0) >= 5) issues.push({ key: "notif_fail", msg: `🔴 ${failCount} WA notif gagal dalam 60 menit` });

  // 4. Nol order di jam buka
  const jam = new Date().getHours();
  if (jam >= 14 && jam <= 22) {
    const { count: lastHour } = await db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", h1);
    if ((lastHour ?? 0) === 0) issues.push({ key: "zero_orders", msg: `🔴 NOL order dalam 60 menit (jam buka)` });
  }

  const firingKeys = new Set(issues.map(i => i.key));
  const { data: states } = await db.from("alert_state").select("*");
  const stateMap = new Map((states ?? []).map(s => [s.alert_key, s]));

  // Kirim alert baru (firing)
  for (const i of issues) {
    const prev = stateMap.get(i.key);
    if (!prev || prev.status === "resolved") {
      await tg(TG_TOKEN, TG_CHAT, i.msg);
      await db.from("alert_state").upsert({ alert_key: i.key, status: "firing", alerted_at: new Date().toISOString(), resolved_at: null }, { onConflict: "alert_key" });
      await db.from("system_events").insert({ source: "monitor", level: "error", event_type: "alert_sent", message: i.msg });
    }
  }
  // Tandai pulih
  for (const s of states ?? []) {
    if (s.status === "firing" && !firingKeys.has(s.alert_key)) {
      await tg(TG_TOKEN, TG_CHAT, `✅ Pulih: ${s.alert_key}`);
      await db.from("alert_state").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("alert_key", s.alert_key);
      await db.from("system_events").insert({ source: "monitor", level: "info", event_type: "alert_resolved", message: `Pulih: ${s.alert_key}` });
    }
  }

  return Response.json({ ok: true, firing: issues.length }, { headers: CORS });
});
```

- [ ] **Step 2: Set Secrets** (jalankan owner, token Telegram BUKAN di repo):
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<token-dari-botfather>
supabase secrets set TELEGRAM_CHAT_ID=<chat-id>
```

- [ ] **Step 3: Deploy** — `supabase functions deploy system-health-monitor`

- [ ] **Step 4: Verifikasi** — buat anomali (set 1 order pending_payment 30 mnt lalu), invoke manual:
```bash
curl -X POST "$SUPABASE_URL/functions/v1/system-health-monitor" -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```
Expected: pesan masuk ke Telegram + baris di `system_events`. Invoke kedua kali → TIDAK kirim ulang (anti-spam). Bersihkan order test → invoke → pesan "✅ Pulih".

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/system-health-monitor/index.ts
git commit -m "Monitoring: Edge Function system-health-monitor + alert Telegram + anti-spam"
```

---

### Task 13: Jadwal pg_cron + panel Log Alert

**Files:**
- Create: `supabase/migrations/20260604_monitor_cron.sql`
- Modify: `assets/js/monitoring.js`

- [ ] **Step 1: Tulis migration cron** (ikuti pola `20260521_auto_cancel_cron.sql`):
```sql
-- 20260604_monitor_cron.sql — jadwalkan system-health-monitor tiap 3 menit
select cron.schedule(
  'system-health-monitor',
  '*/3 * * * *',
  $$
  select net.http_post(
    url     := '<SUPABASE_URL>/functions/v1/system-health-monitor',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type','application/json'),
    body    := '{}'::jsonb
  );
  $$
);
```
Catatan: ganti `<SUPABASE_URL>` & `<SERVICE_ROLE_KEY>` sesuai pola file cron existing (cek bagaimana `auto-cancel` menyimpannya — kemungkinan via Vault/secret, bukan literal).

- [ ] **Step 2: Jalankan di SQL Editor & verifikasi** — `SELECT * FROM cron.job WHERE jobname='system-health-monitor';` → 1 baris. Tunggu 3 menit, cek `system_events` bertambah saat ada anomali.

- [ ] **Step 3: Render panel Log Alert** di `monitoring.js`:
```js
async function loadAlertLog() {
  const { data } = await window.db.from('system_events')
    .select('*').in('event_type', ['alert_sent','alert_resolved'])
    .order('created_at', { ascending: false }).limit(20);
  const el = document.getElementById('alertLog');
  el.innerHTML = (data?.length)
    ? data.map(e => `<div class="alert-row">${fmtTimeAgo(e.created_at)} — ${e.message}</div>`).join('')
    : '<p class="muted">Belum ada alert</p>';
}
```
Tambah `await loadAlertLog();` ke `refreshAll`.

- [ ] **Step 4: Verifikasi** — picu anomali → panel Log Alert menampilkan baris alert; realtime (subscribe `system_events` dari Task 11) update otomatis.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260604_monitor_cron.sql assets/js/monitoring.js
git commit -m "Monitoring: pg_cron monitor tiap 3 mnt + panel Log Alert"
```

**🚩 Checkpoint M3:** Alert Telegram otomatis + anti-spam aktif. Dashboard lengkap.

---

## FASE M4 — Kapasitas + setup eksternal (opsional, ringan)

### Task 14: Panel kapasitas Supabase

**Files:**
- Modify: `supabase/functions/system-health-check/index.ts` (tambah blok kapasitas)
- Modify: `assets/js/monitoring.js` (render `#capacityPanel`)

- [ ] **Step 1: Tambah ukuran DB & storage di health-check** — query `pg_database_size(current_database())` via RPC, dan total objek storage. Render bar % terhadap limit free tier (DB 500MB, storage 1GB) di `#capacityPanel`. Cukup info, bukan alert.

- [ ] **Step 2: Verifikasi** — reload, panel kapasitas tampil persentase wajar.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/system-health-check/index.ts assets/js/monitoring.js
git commit -m "Monitoring: panel kapasitas Supabase (DB & storage)"
```

### Task 15: Update Plans.md + catatan setup manual

**Files:**
- Modify: `Plans.md` (tambah Phase 13 — Monitoring, tandai task selesai)

- [ ] **Step 1: Tambah Phase 13 ringkasan** di `Plans.md` dengan checklist M1–M4 + catatan: setup UptimeRobot eksternal (HTTP monitor `order.sukashawarma.com` → Telegram), regenerate token Telegram via @BotFather sebelum produksi.

- [ ] **Step 2: Commit**

```bash
git add Plans.md
git commit -m "Plans: tambah Phase 13 Monitoring Sistem"
```

---

## Catatan Owner (di luar kode)
1. **Regenerate token Telegram** via @BotFather (`/revoke`) — token yang dishare saat brainstorm sudah ter-expose. Set token baru ke `TELEGRAM_BOT_TOKEN`.
2. **Ambil `chat_id`** — kirim pesan apa saja ke bot, lalu buka `https://api.telegram.org/bot<token>/getUpdates`, ambil `chat.id`. Set ke `TELEGRAM_CHAT_ID`.
3. **UptimeRobot** (gratis) — tambah HTTP monitor `https://order.sukashawarma.com`, hubungkan ke Telegram. Layer "tahu walau semua tumbang".
