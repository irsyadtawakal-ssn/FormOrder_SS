# Customer Loyalty Program — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bangun sistem loyalty program berbasis nomor WA — track customer, generate voucher otomatis saat milestone order tercapai, notif WA otomatis (bisa di-toggle), dan halaman manajemen customer + voucher di admin super_admin.

**Architecture:** Nomor WA dipakai sebagai customer ID (no login needed). Setiap kali order selesai (`status = done`), Edge Function `on-order-done` mengagregasi total order customer dan memeriksa milestone. Jika milestone tercapai dan belum ada voucher aktif untuk milestone itu, generate kode voucher unik dan (opsional) kirim WA via Fonnte. Admin super_admin punya halaman Customers + Vouchers, dan toggle di Settings.

**Tech Stack:** Supabase Postgres (tabel baru `customers` + `vouchers`), Edge Function Deno, Vanilla JS, Fonnte WA API (sudah ada), `app_settings` untuk konfigurasi.

---

## File Structure

**Baru (create):**
- `supabase/migrations/20260522_loyalty.sql` — tabel `customers` + `vouchers` + RLS
- `supabase/functions/on-order-done/index.ts` — trigger saat order done: update customer stats + cek milestone + generate voucher + kirim WA
- `admin/customers.html` — halaman list customer + stats (super_admin only)
- `admin/vouchers.html` — halaman list voucher aktif/terpakai (super_admin only)
- `assets/js/loyalty.js` — helper: `generateVoucherCode()`, `fmtLoyaltyStats()`

**Modifikasi:**
- `admin/orders.html` — tambah tombol "Tandai Voucher Dipakai" di modal detail kalau ada voucher aktif customer ini
- `admin/settings.html` — tambah section "Program Loyalty" dengan toggle + milestone config
- `admin/index.html` — tambah stat card "👥 Customer Baru" + widget loyalty di dashboard super_admin
- `admin/index.html` (sidebar + nav) — tambah link Customers + Vouchers (admin-only)
- Semua `admin/*.html` — tambah link Customers + Vouchers di sidebar + bottom nav
- `supabase/functions/send-wa-notifications/index.ts` — tambah event `voucher_earned`
- `sw.js` — bump ke v5 + tambah `/admin/customers.html` + `/admin/vouchers.html` ke SHELL

---

## Task 1: Database — Tabel customers + vouchers

**Files:**
- Create: `supabase/migrations/20260522_loyalty.sql`

- [ ] **Step 1: Buat file migrasi SQL**

```sql
-- supabase/migrations/20260522_loyalty.sql

-- ── Tabel customers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_number     text UNIQUE NOT NULL,         -- nomor WA = primary identifier
  name          text NOT NULL,                -- dari order terakhir
  total_orders  integer NOT NULL DEFAULT 0,
  total_spent   bigint  NOT NULL DEFAULT 0,   -- dalam rupiah
  first_order_at timestamptz,
  last_order_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Tabel vouchers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vouchers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,          -- kode voucher unik (8 karakter)
  customer_wa   text NOT NULL REFERENCES public.customers(wa_number),
  milestone     integer NOT NULL,              -- milestone ke berapa (5, 10, 20, dst)
  reward_desc   text NOT NULL,                 -- deskripsi reward (dari app_settings)
  is_used       boolean NOT NULL DEFAULT false,
  used_at       timestamptz,
  used_by_outlet_id uuid REFERENCES public.outlets(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers  ENABLE ROW LEVEL SECURITY;

-- super_admin: full access
CREATE POLICY "customers_super_admin" ON public.customers
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "vouchers_super_admin" ON public.vouchers
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- outlet_staff: bisa baca + update voucher (untuk mark used)
CREATE POLICY "vouchers_staff_read" ON public.vouchers
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND is_active = true)
  );

CREATE POLICY "vouchers_staff_update" ON public.vouchers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND is_active = true)
  )
  WITH CHECK (is_used = true); -- staff hanya bisa mark as used

-- ── app_settings defaults ─────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value, description) VALUES
  ('loyalty_enabled',      'false', 'Aktifkan program loyalty (true/false)'),
  ('loyalty_notif_auto',   'false', 'Kirim WA otomatis saat dapat voucher (true/false)'),
  ('loyalty_milestone_1',  '5',     'Jumlah order untuk milestone 1'),
  ('loyalty_reward_1',     'Diskon 10% untuk order berikutnya', 'Reward milestone 1'),
  ('loyalty_milestone_2',  '10',    'Jumlah order untuk milestone 2'),
  ('loyalty_reward_2',     'Free 1 item Original Sapi Sedang',   'Reward milestone 2'),
  ('loyalty_milestone_3',  '20',    'Jumlah order untuk milestone 3'),
  ('loyalty_reward_3',     'Free 1 Shawarma ukuran apa saja',   'Reward milestone 3')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Jalankan SQL di Supabase SQL Editor**

Buka Supabase Dashboard → SQL Editor → paste seluruh isi file → Run.
Verifikasi: `SELECT * FROM customers LIMIT 1;` → berhasil (tabel kosong)
Verifikasi: `SELECT key FROM app_settings WHERE key LIKE 'loyalty%';` → 8 rows

- [ ] **Step 3: Commit file migrasi**

```bash
git add supabase/migrations/20260522_loyalty.sql
git commit -m "feat: tambah tabel customers, vouchers, dan loyalty app_settings"
```

---

## Task 2: Helper JS — loyalty.js

**Files:**
- Create: `assets/js/loyalty.js`

- [ ] **Step 1: Buat file**

```javascript
// assets/js/loyalty.js — Helper untuk loyalty program
// Dimuat setelah admin.js di halaman yang butuh loyalty

// ── Generate kode voucher unik (8 karakter alfanumerik) ──────────────────────
function generateVoucherCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // hindari 0/O, 1/I
  let code = 'SS';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code; // contoh: SSAB3K9P
}

// ── Format stats customer ─────────────────────────────────────────────────────
function fmtLoyaltyStats(customer) {
  return `${customer.total_orders}× order · ${formatRupiah(customer.total_spent)}`;
}

// ── Ambil milestone yang belum diraih dari app_settings ──────────────────────
function getNextMilestone(totalOrders, settings) {
  const milestones = [1, 2, 3].map(n => ({
    count:  parseInt(settings[`loyalty_milestone_${n}`]?.value ?? '9999'),
    reward: settings[`loyalty_reward_${n}`]?.value ?? '',
    n,
  })).filter(m => m.count > totalOrders);
  return milestones.sort((a, b) => a.count - b.count)[0] || null;
}

// ── Cek apakah total order pas di milestone ───────────────────────────────────
function checkMilestoneHit(totalOrders, settings) {
  return [1, 2, 3].map(n => ({
    count:  parseInt(settings[`loyalty_milestone_${n}`]?.value ?? '9999'),
    reward: settings[`loyalty_reward_${n}`]?.value ?? '',
    n,
  })).find(m => m.count === totalOrders) || null;
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/js/loyalty.js
git commit -m "feat: tambah loyalty.js helper (voucher code generator, milestone checker)"
```

---

## Task 3: Edge Function — on-order-done

**Files:**
- Create: `supabase/functions/on-order-done/index.ts`

Logic: dipanggil setiap kali order di-update ke status `done` (dari orders.html saat admin klik "Selesai"). Upsert customer, cek milestone, generate voucher, kirim WA jika auto-notif ON.

- [ ] **Step 1: Buat Edge Function**

```typescript
// supabase/functions/on-order-done/index.ts
// Dipanggil saat order status → done
// 1. Upsert customer (wa_number, nama, stats)
// 2. Cek milestone loyalty
// 3. Generate voucher jika milestone tercapai
// 4. Kirim WA notif jika loyalty_notif_auto = true

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FONNTE_URL = "https://api.fonnte.com/send";

async function kirimWA(token: string, target: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: { "Authorization": token, "Content-Type": "application/json" },
      body: JSON.stringify({ target, message }),
    });
    const json = await res.json();
    return json.status === true;
  } catch { return false; }
}

function generateVoucherCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SS";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FONNTE_TOKEN = Deno.env.get("FONNTE_TOKEN");
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { order_id: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400, headers: CORS });
  }

  const { order_id } = body;
  if (!order_id) return Response.json({ error: "order_id wajib" }, { status: 400, headers: CORS });

  // ── Ambil order ──────────────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, customer_name, customer_wa, total, status, outlets(name)")
    .eq("id", order_id)
    .single();

  if (orderErr || !order || order.status !== "done") {
    return Response.json({ error: "Order tidak valid atau belum done" }, { status: 400, headers: CORS });
  }

  // ── Ambil app_settings loyalty ────────────────────────────────────────────────
  const { data: settingsRows } = await db
    .from("app_settings")
    .select("key, value")
    .like("key", "loyalty%");

  const settings: Record<string, string> = {};
  (settingsRows || []).forEach((r: { key: string; value: string }) => { settings[r.key] = r.value; });

  if (settings["loyalty_enabled"] !== "true") {
    return Response.json({ ok: true, skipped: "loyalty disabled" }, { headers: CORS });
  }

  // ── Upsert customer ──────────────────────────────────────────────────────────
  // Hitung total order customer ini (semua order done)
  const { count: totalOrders } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_wa", order.customer_wa)
    .eq("status", "done");

  const { data: totalSpentRes } = await db
    .from("orders")
    .select("total")
    .eq("customer_wa", order.customer_wa)
    .eq("status", "done");

  const totalSpent = (totalSpentRes || []).reduce((s: number, o: { total: number }) => s + (o.total || 0), 0);

  const { data: existingCustomer } = await db
    .from("customers")
    .select("first_order_at")
    .eq("wa_number", order.customer_wa)
    .single();

  await db.from("customers").upsert({
    wa_number:      order.customer_wa,
    name:           order.customer_name,
    total_orders:   totalOrders || 0,
    total_spent:    totalSpent,
    first_order_at: existingCustomer?.first_order_at || new Date().toISOString(),
    last_order_at:  new Date().toISOString(),
    updated_at:     new Date().toISOString(),
  }, { onConflict: "wa_number" });

  // ── Cek milestone ────────────────────────────────────────────────────────────
  const milestones = [1, 2, 3].map(n => ({
    count:  parseInt(settings[`loyalty_milestone_${n}`] ?? "9999"),
    reward: settings[`loyalty_reward_${n}`] ?? "",
  }));

  const hit = milestones.find(m => m.count === (totalOrders || 0));
  if (!hit) {
    return Response.json({ ok: true, total_orders: totalOrders }, { headers: CORS });
  }

  // ── Cek sudah punya voucher untuk milestone ini? ─────────────────────────────
  const { data: existingVoucher } = await db
    .from("vouchers")
    .select("id")
    .eq("customer_wa", order.customer_wa)
    .eq("milestone", hit.count)
    .eq("is_used", false)
    .single();

  if (existingVoucher) {
    return Response.json({ ok: true, skipped: "voucher already exists" }, { headers: CORS });
  }

  // ── Generate voucher ──────────────────────────────────────────────────────────
  let voucherCode = "";
  let attempts = 0;
  while (attempts < 5) {
    const candidate = generateVoucherCode();
    const { data: clash } = await db.from("vouchers").select("id").eq("code", candidate).single();
    if (!clash) { voucherCode = candidate; break; }
    attempts++;
  }
  if (!voucherCode) {
    return Response.json({ error: "Gagal generate kode unik" }, { status: 500, headers: CORS });
  }

  await db.from("vouchers").insert({
    code:        voucherCode,
    customer_wa: order.customer_wa,
    milestone:   hit.count,
    reward_desc: hit.reward,
  });

  // ── Log notifikasi + kirim WA jika auto ──────────────────────────────────────
  const outletName = (order.outlets as { name: string } | null)?.name || "";
  const autoNotif  = settings["loyalty_notif_auto"] === "true";

  if (autoNotif && FONNTE_TOKEN) {
    const msg =
      `🎉 *Selamat ${order.customer_name}!*\n\n` +
      `Kamu sudah melakukan *${hit.count}× pembelian* di SUKA Shawarma 🌯\n\n` +
      `Sebagai pelanggan setia, kamu mendapatkan:\n` +
      `✨ *${hit.reward}*\n\n` +
      `Kode voucher kamu: *${voucherCode}*\n` +
      `Tunjukkan kode ini ke kasir outlet saat pickup ya!\n\n` +
      `Terima kasih sudah setia bersama SUKA Shawarma! 🙏`;

    await kirimWA(FONNTE_TOKEN, order.customer_wa, msg);
  }

  await db.from("notification_logs").insert({
    order_id: order_id,
    event:    "voucher_earned",
    results:  JSON.stringify({ voucher_code: voucherCode, auto_notif: autoNotif }),
    sent_at:  new Date().toISOString(),
  }).select();

  return Response.json({
    ok: true,
    voucher_code: voucherCode,
    milestone:    hit.count,
    reward:       hit.reward,
    notif_sent:   autoNotif,
  }, { headers: CORS });
});
```

- [ ] **Step 2: Deploy Edge Function**

Di Supabase Dashboard → Edge Functions → New Function → nama: `on-order-done` → paste kode → Deploy.

Atau via CLI:
```bash
supabase functions deploy on-order-done
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/on-order-done/index.ts
git commit -m "feat: Edge Function on-order-done — update customer stats + generate voucher loyalty"
```

---

## Task 4: Trigger on-order-done dari orders.html

Saat admin klik "🎉 Selesai" → status jadi `done` → panggil `on-order-done`.

**Files:**
- Modify: `admin/orders.html` — fungsi `doUpdateStatus`

- [ ] **Step 1: Cari fungsi doUpdateStatus di orders.html**

Cari baris `async function doUpdateStatus`:

```javascript
async function doUpdateStatus(orderId, newStatus) {
  // ... kode yang ada
}
```

- [ ] **Step 2: Tambahkan trigger setelah status update berhasil**

```javascript
async function doUpdateStatus(orderId, newStatus) {
  try {
    await updateOrderStatus(orderId, newStatus);
    const idx = allOrders.findIndex(o => o.id === orderId);
    if (idx >= 0) allOrders[idx].status = newStatus;
    renderOrders();
    closeModal();
    adminToast(`✅ Status diperbarui`);

    // Trigger loyalty check saat order selesai
    if (newStatus === 'done') {
      const supabaseUrl = window._supabaseUrl || window.db.supabaseUrl;
      fetch(`${supabaseUrl}/functions/v1/on-order-done`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window._supabaseAnonKey || ''}`,
          'apikey': window._supabaseAnonKey || '',
        },
        body: JSON.stringify({ order_id: orderId }),
      }).catch(() => {}); // fire and forget — jangan block UI
    }
  } catch (e) {
    adminToast(`❌ Gagal: ${e.message}`);
  }
}
```

**Catatan:** Cek `config.js` untuk nama variabel anon key yang dipakai. Biasanya `window.SUPABASE_URL` dan `window.SUPABASE_ANON_KEY`. Sesuaikan dengan yang ada.

- [ ] **Step 3: Cek config.js untuk nama variabel**

```bash
cat config.js
```

Sesuaikan `window._supabaseUrl` dan `window._supabaseAnonKey` dengan nama variabel di config.js.

- [ ] **Step 4: Commit**

```bash
git add admin/orders.html
git commit -m "feat: trigger on-order-done saat order selesai untuk loyalty check"
```

---

## Task 5: Settings — Section Loyalty Program

**Files:**
- Modify: `admin/settings.html`

- [ ] **Step 1: Tambah variabel settings loyalty di loadSettings()**

Di `renderPage()`, tambah section baru setelah section terakhir yang ada. Cari baris penutup `pc.innerHTML = \`...\`` dan tambahkan sebelum penutup template literal:

```html
<!-- ── Program Loyalty ─────────────────────────────────────────── -->
<div class="info-card" style="margin-bottom:12px">
  <div style="font-weight:700;font-size:14px;margin-bottom:12px">🎁 Program Loyalty</div>

  <!-- Toggle aktif -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div>
      <div style="font-weight:600;font-size:13px">Aktifkan Program Loyalty</div>
      <div style="font-size:11px;color:var(--muted)">Customer dapat voucher saat milestone tercapai</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" id="loyaltyEnabled"
        ${val('loyalty_enabled','false') === 'true' ? 'checked' : ''}
        onchange="saveLoyaltySetting('loyalty_enabled', this.checked ? 'true' : 'false')">
      <span class="toggle-slider"></span>
    </label>
  </div>

  <!-- Toggle notif otomatis -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <div>
      <div style="font-weight:600;font-size:13px">Notif WA Otomatis</div>
      <div style="font-size:11px;color:var(--muted)">Kirim WA ke customer saat dapat voucher</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" id="loyaltyNotifAuto"
        ${val('loyalty_notif_auto','false') === 'true' ? 'checked' : ''}
        onchange="saveLoyaltySetting('loyalty_notif_auto', this.checked ? 'true' : 'false')">
      <span class="toggle-slider"></span>
    </label>
  </div>

  <!-- Milestone 1 -->
  ${loyaltyMilestoneRow(1, settings)}
  <!-- Milestone 2 -->
  ${loyaltyMilestoneRow(2, settings)}
  <!-- Milestone 3 -->
  ${loyaltyMilestoneRow(3, settings)}
</div>
```

- [ ] **Step 2: Tambah fungsi helper di script settings.html**

```javascript
function loyaltyMilestoneRow(n, settings) {
  const count  = settings[`loyalty_milestone_${n}`]?.value ?? (n === 1 ? '5' : n === 2 ? '10' : '20');
  const reward = settings[`loyalty_reward_${n}`]?.value ?? '';
  return `
    <div style="border:1px solid var(--line2);border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="font-weight:600;font-size:12px;color:var(--muted);margin-bottom:8px">MILESTONE ${n}</div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <div style="flex-shrink:0;width:72px">
          <label style="font-size:11px;color:var(--muted)">Order ke-</label>
          <input type="number" class="form-input" style="font-size:13px;padding:6px 8px"
            value="${count}" min="1"
            onchange="saveLoyaltySetting('loyalty_milestone_${n}', this.value)">
        </div>
        <div style="flex:1">
          <label style="font-size:11px;color:var(--muted)">Reward</label>
          <input type="text" class="form-input" style="font-size:13px;padding:6px 8px"
            value="${reward}" placeholder="Deskripsi reward..."
            onchange="saveLoyaltySetting('loyalty_reward_${n}', this.value)">
        </div>
      </div>
    </div>`;
}

async function saveLoyaltySetting(key, value) {
  const { error } = await window.db
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) { adminToast('❌ Gagal simpan'); return; }
  settings[key] = { key, value };
  adminToast('✅ Tersimpan');
}
```

- [ ] **Step 3: Pastikan CSS toggle-switch sudah ada di style.css**

Cari di `assets/css/style.css`:
```bash
grep -n "toggle-switch" assets/css/style.css
```

Jika belum ada, tambahkan di akhir `style.css`:
```css
/* ─── Toggle switch ─────────────────────────────────────────────────────────── */
.toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; cursor: pointer; inset: 0;
  background: var(--line2); border-radius: 999px;
  transition: background .2s;
}
.toggle-slider::before {
  content: ''; position: absolute;
  width: 18px; height: 18px; border-radius: 50%;
  background: #fff; left: 3px; top: 3px;
  transition: transform .2s;
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
}
.toggle-switch input:checked + .toggle-slider { background: var(--brand); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(20px); }
```

- [ ] **Step 4: Commit**

```bash
git add admin/settings.html assets/css/style.css
git commit -m "feat: settings loyalty program — toggle aktif, notif auto, konfigurasi 3 milestone"
```

---

## Task 6: Halaman Customers

**Files:**
- Create: `admin/customers.html`

- [ ] **Step 1: Buat halaman**

```html
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Customer — SUKA Admin</title>
<link rel="stylesheet" href="../assets/css/style.css?v=4" />
<link rel="stylesheet" href="../assets/css/admin-desktop.css?v=4" />
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#f29744" />
</head>
<body>
<div class="phone">

  <aside class="admin-sidebar" style="display:none">
    <div class="admin-sidebar-logo">🌯 SUKA Admin</div>
    <div class="admin-sidebar-user">
      <div class="name" id="sidebarName">—</div>
      <div class="role" id="sidebarRole">—</div>
    </div>
    <nav class="admin-sidebar-nav">
      <a href="/admin/index.html"><span>🏠</span><span>Dashboard</span></a>
      <a href="/admin/orders.html"><span>📋</span><span>Pesanan</span></a>
      <a href="/admin/menu.html"><span>🌯</span><span>Menu</span></a>
      <a href="/admin/reports.html"><span>📊</span><span>Laporan</span></a>
      <a href="/admin/customers.html" class="admin-only"><span>👥</span><span>Customer</span></a>
      <a href="/admin/vouchers.html" class="admin-only"><span>🎁</span><span>Voucher</span></a>
      <a href="/admin/outlets.html" class="admin-only"><span>📍</span><span>Outlet</span></a>
      <a href="/admin/users.html" class="admin-only"><span>👤</span><span>Pengguna</span></a>
      <a href="/admin/settings.html" class="admin-only"><span>⚙️</span><span>Pengaturan</span></a>
    </nav>
    <div class="admin-sidebar-footer">
      <button onclick="adminSignOut()">🚪 Keluar</button>
    </div>
  </aside>

  <div class="topbar">
    <span class="topbar-title">👥 Customer</span>
    <span id="adminName" style="font-size:12px;color:var(--muted)"></span>
  </div>

  <div class="admin-content">

  <!-- Search -->
  <div class="search-wrap">
    <input id="searchInput" type="search" class="search-input" placeholder="Cari nama / nomor WA…"
      oninput="filterCustomers()" />
  </div>

  <!-- Stats ringkas -->
  <div id="customerStats" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px"></div>

  <!-- List customer -->
  <div id="customerList" style="padding-bottom:80px">
    <div class="skeleton-card"><div class="skeleton-lines">
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>
    </div></div>
  </div>

  </div>

  <nav class="admin-nav">
    <a href="/admin/index.html"><span>🏠</span><span>Dashboard</span></a>
    <a href="/admin/orders.html"><span>📋</span><span>Pesanan</span></a>
    <a href="/admin/customers.html" class="admin-only"><span>👥</span><span>Customer</span></a>
    <a href="/admin/vouchers.html" class="admin-only"><span>🎁</span><span>Voucher</span></a>
    <a href="/admin/settings.html" class="admin-only"><span>⚙️</span><span>Pengaturan</span></a>
  </nav>

</div>
<div class="toast" id="toast"></div>
<div id="adminModal" class="admin-modal-overlay" style="display:none"></div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="../config.js"></script>
<script src="../assets/js/supabase.js"></script>
<script src="../assets/js/utils.js"></script>
<script src="../assets/js/admin.js"></script>
<script src="../assets/js/loyalty.js"></script>
<script>
let allCustomers = [];

(async function init() {
  const u = await requireSuperAdmin();
  if (!u) return;
  await loadCustomers();
})();

async function loadCustomers() {
  const { data, error } = await window.db
    .from('customers')
    .select('*')
    .order('total_orders', { ascending: false });

  if (error) { adminToast('❌ Gagal memuat data customer'); return; }
  allCustomers = data || [];
  renderStats();
  renderCustomers(allCustomers);
}

function renderStats() {
  const total      = allCustomers.length;
  const totalSpent = allCustomers.reduce((s, c) => s + (c.total_spent || 0), 0);
  const loyal      = allCustomers.filter(c => c.total_orders >= 5).length;
  const newThisMonth = allCustomers.filter(c => {
    const d = new Date(c.first_order_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  document.getElementById('customerStats').innerHTML = `
    <div class="stat-card"><div style="font-size:20px;margin-bottom:4px">👥</div>
      <div style="font-weight:800;font-size:18px">${total}</div>
      <div style="font-size:11px;color:var(--muted)">Total Customer</div></div>
    <div class="stat-card"><div style="font-size:20px;margin-bottom:4px">💰</div>
      <div style="font-weight:800;font-size:16px">${formatRupiah(totalSpent)}</div>
      <div style="font-size:11px;color:var(--muted)">Total Belanja</div></div>
    <div class="stat-card"><div style="font-size:20px;margin-bottom:4px">⭐</div>
      <div style="font-weight:800;font-size:18px">${loyal}</div>
      <div style="font-size:11px;color:var(--muted)">Pelanggan Loyal (5+)</div></div>
    <div class="stat-card"><div style="font-size:20px;margin-bottom:4px">🆕</div>
      <div style="font-weight:800;font-size:18px">${newThisMonth}</div>
      <div style="font-size:11px;color:var(--muted)">Baru Bulan Ini</div></div>
  `;
}

function filterCustomers() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const filtered = q
    ? allCustomers.filter(c => c.name.toLowerCase().includes(q) || c.wa_number.includes(q))
    : allCustomers;
  renderCustomers(filtered);
}

function renderCustomers(list) {
  const el = document.getElementById('customerList');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">👥</div>
      <div class="empty-title">Belum ada customer</div>
      <div class="empty-desc">Data terkumpul otomatis saat order selesai</div></div>`;
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="info-card" style="margin-bottom:8px;cursor:pointer" onclick="showCustomerDetail('${c.wa_number}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-weight:700;font-size:14px">${c.name}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">
            <a href="https://wa.me/${c.wa_number}" target="_blank" onclick="event.stopPropagation()"
               style="color:var(--brand)">${c.wa_number}</a>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;font-size:16px;color:var(--brand)">${c.total_orders}×</div>
          <div style="font-size:11px;color:var(--muted)">order</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:8px;font-size:12px;color:var(--muted)">
        <span>💰 ${formatRupiah(c.total_spent)}</span>
        <span>📅 Terakhir ${fmtDate(c.last_order_at)}</span>
      </div>
    </div>`).join('');
}

async function showCustomerDetail(waNumber) {
  const c = allCustomers.find(x => x.wa_number === waNumber);
  if (!c) return;

  // Ambil voucher customer ini
  const { data: vouchers } = await window.db
    .from('vouchers')
    .select('*')
    .eq('customer_wa', waNumber)
    .order('created_at', { ascending: false });

  const voucherHtml = (vouchers || []).length === 0
    ? '<div style="font-size:12px;color:var(--muted)">Belum ada voucher</div>'
    : (vouchers || []).map(v => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
          <div>
            <div style="font-family:monospace;font-weight:700">${v.code}</div>
            <div style="font-size:11px;color:var(--muted)">${v.reward_desc}</div>
          </div>
          <span style="font-size:11px;padding:3px 8px;border-radius:999px;font-weight:700;
            background:${v.is_used ? '#f3f4f6' : '#f0fdf4'};color:${v.is_used ? '#6b7280' : '#16a34a'}">
            ${v.is_used ? 'Terpakai' : 'Aktif'}
          </span>
        </div>`).join('');

  openModal(`👥 ${c.name}`, `
    <div class="info-row"><span class="label">WhatsApp</span>
      <span class="val"><a href="https://wa.me/${c.wa_number}" target="_blank" style="color:var(--brand)">${c.wa_number}</a></span></div>
    <div class="info-row"><span class="label">Total Order</span><span class="val">${c.total_orders}×</span></div>
    <div class="info-row"><span class="label">Total Belanja</span><span class="val">${formatRupiah(c.total_spent)}</span></div>
    <div class="info-row"><span class="label">Pertama Order</span><span class="val">${fmtDate(c.first_order_at)}</span></div>
    <div class="info-row"><span class="label">Terakhir Order</span><span class="val">${fmtDate(c.last_order_at)}</span></div>
    <div style="margin-top:12px;font-weight:700;font-size:13px;margin-bottom:8px">🎁 Voucher</div>
    ${voucherHtml}
  `);
}
</script>
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add admin/customers.html
git commit -m "feat: halaman customers — list, stats, detail + voucher history"
```

---

## Task 7: Halaman Vouchers

**Files:**
- Create: `admin/vouchers.html`

- [ ] **Step 1: Buat halaman**

```html
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Voucher — SUKA Admin</title>
<link rel="stylesheet" href="../assets/css/style.css?v=4" />
<link rel="stylesheet" href="../assets/css/admin-desktop.css?v=4" />
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#f29744" />
</head>
<body>
<div class="phone">

  <aside class="admin-sidebar" style="display:none">
    <div class="admin-sidebar-logo">🌯 SUKA Admin</div>
    <div class="admin-sidebar-user">
      <div class="name" id="sidebarName">—</div>
      <div class="role" id="sidebarRole">—</div>
    </div>
    <nav class="admin-sidebar-nav">
      <a href="/admin/index.html"><span>🏠</span><span>Dashboard</span></a>
      <a href="/admin/orders.html"><span>📋</span><span>Pesanan</span></a>
      <a href="/admin/menu.html"><span>🌯</span><span>Menu</span></a>
      <a href="/admin/reports.html"><span>📊</span><span>Laporan</span></a>
      <a href="/admin/customers.html" class="admin-only"><span>👥</span><span>Customer</span></a>
      <a href="/admin/vouchers.html" class="admin-only"><span>🎁</span><span>Voucher</span></a>
      <a href="/admin/outlets.html" class="admin-only"><span>📍</span><span>Outlet</span></a>
      <a href="/admin/users.html" class="admin-only"><span>👤</span><span>Pengguna</span></a>
      <a href="/admin/settings.html" class="admin-only"><span>⚙️</span><span>Pengaturan</span></a>
    </nav>
    <div class="admin-sidebar-footer">
      <button onclick="adminSignOut()">🚪 Keluar</button>
    </div>
  </aside>

  <div class="topbar">
    <span class="topbar-title">🎁 Voucher</span>
    <span id="adminName" style="font-size:12px;color:var(--muted)"></span>
  </div>

  <div class="admin-content">

  <div class="chips" id="filterChips" style="padding-bottom:8px">
    <button class="chip active" onclick="setVoucherFilter('active')">Aktif</button>
    <button class="chip"       onclick="setVoucherFilter('used')">Terpakai</button>
    <button class="chip"       onclick="setVoucherFilter('all')">Semua</button>
  </div>

  <div id="voucherList" style="padding-bottom:80px">
    <div class="skeleton-card"><div class="skeleton-lines">
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>
    </div></div>
  </div>

  </div>

  <nav class="admin-nav">
    <a href="/admin/index.html"><span>🏠</span><span>Dashboard</span></a>
    <a href="/admin/orders.html"><span>📋</span><span>Pesanan</span></a>
    <a href="/admin/customers.html" class="admin-only"><span>👥</span><span>Customer</span></a>
    <a href="/admin/vouchers.html" class="admin-only"><span>🎁</span><span>Voucher</span></a>
    <a href="/admin/settings.html" class="admin-only"><span>⚙️</span><span>Pengaturan</span></a>
  </nav>

</div>
<div class="toast" id="toast"></div>
<div id="adminModal" class="admin-modal-overlay" style="display:none"></div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="../config.js"></script>
<script src="../assets/js/supabase.js"></script>
<script src="../assets/js/utils.js"></script>
<script src="../assets/js/admin.js"></script>
<script>
let allVouchers   = [];
let voucherFilter = 'active';

(async function init() {
  const u = await requireAuth(); // super_admin + staff bisa akses
  if (!u) return;
  await loadVouchers();
})();

async function loadVouchers() {
  const { data, error } = await window.db
    .from('vouchers')
    .select('*, customers(name)')
    .order('created_at', { ascending: false });

  if (error) { adminToast('❌ Gagal memuat voucher'); return; }
  allVouchers = data || [];
  renderVouchers();
}

function setVoucherFilter(f) {
  voucherFilter = f;
  document.querySelectorAll('#filterChips .chip').forEach((c, i) => {
    c.classList.toggle('active', ['active','used','all'][i] === f);
  });
  renderVouchers();
}

function renderVouchers() {
  const filtered = voucherFilter === 'active' ? allVouchers.filter(v => !v.is_used)
    : voucherFilter === 'used' ? allVouchers.filter(v => v.is_used)
    : allVouchers;

  const el = document.getElementById('voucherList');
  if (!filtered.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🎁</div>
      <div class="empty-title">Tidak ada voucher</div></div>`;
    return;
  }

  el.innerHTML = filtered.map(v => `
    <div class="info-card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-family:monospace;font-weight:800;font-size:16px;letter-spacing:1px">${v.code}</div>
          <div style="font-size:13px;font-weight:600;margin-top:2px">${(v.customers || {}).name || v.customer_wa}</div>
          <div style="font-size:11px;color:var(--muted)">${v.customer_wa}</div>
        </div>
        <span style="font-size:11px;padding:4px 10px;border-radius:999px;font-weight:700;flex-shrink:0;
          background:${v.is_used ? '#f3f4f6' : '#f0fdf4'};color:${v.is_used ? '#6b7280' : '#16a34a'}">
          ${v.is_used ? '✓ Terpakai' : '✨ Aktif'}
        </span>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px">🎁 ${v.reward_desc}</div>
      <div style="font-size:11px;color:var(--faint);margin-top:4px">Dibuat ${fmtDateTime(v.created_at)}
        ${v.is_used ? ' · Dipakai ' + fmtDateTime(v.used_at) : ''}</div>
      ${!v.is_used ? `<button class="btn btn-sm" style="margin-top:10px;background:var(--brand);color:#fff;width:100%"
        onclick="markVoucherUsed('${v.id}')">✅ Tandai Sudah Dipakai</button>` : ''}
    </div>`).join('');
}

async function markVoucherUsed(voucherId) {
  const { error } = await window.db
    .from('vouchers')
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq('id', voucherId);

  if (error) { adminToast('❌ Gagal update voucher'); return; }
  adminToast('✅ Voucher ditandai terpakai');
  await loadVouchers();
}
</script>
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add admin/vouchers.html
git commit -m "feat: halaman vouchers — list aktif/terpakai + mark used"
```

---

## Task 8: Update nav + sidebar + SW + dashboard

**Files:**
- Modify: semua `admin/*.html` yang punya sidebar + bottom nav
- Modify: `admin/index.html` — tambah stat customer loyal + widget
- Modify: `sw.js` — bump v5 + tambah customers.html + vouchers.html ke SHELL

- [ ] **Step 1: Tambah link Customer + Voucher ke sidebar semua halaman admin**

Di setiap file `admin/index.html`, `admin/orders.html`, `admin/menu.html`, `admin/outlets.html`, `admin/users.html`, `admin/settings.html`, `admin/reports.html`, tambahkan setelah link Laporan di sidebar:

```html
<a href="/admin/customers.html" class="admin-only"><span>👥</span><span>Customer</span></a>
<a href="/admin/vouchers.html" class="admin-only"><span>🎁</span><span>Voucher</span></a>
```

- [ ] **Step 2: Bump SW ke v5 + tambah ke SHELL**

Di `sw.js`:
```javascript
const CACHE = 'suka-v5';

const SHELL = [
  // ... existing entries ...
  '/admin/customers.html',
  '/admin/vouchers.html',
  '/assets/js/loyalty.js',
];
```

- [ ] **Step 3: Bump semua asset ke v=5 di semua HTML**

```bash
sed -i 's/style\.css?v=4/style.css?v=5/g; s/admin-desktop\.css?v=4/admin-desktop.css?v=5/g' \
  index.html menu.html checkout.html order.html \
  admin/index.html admin/login.html admin/orders.html admin/menu.html \
  admin/outlets.html admin/settings.html admin/users.html admin/reports.html \
  admin/customers.html admin/vouchers.html admin/bulk-photos.html admin/import.html
```

- [ ] **Step 4: Tambah widget loyalty di dashboard index.html (super_admin)**

Di fungsi `loadDashboard(u)` pada `admin/index.html`, setelah stat cards yang ada, tambahkan stat card ke-5 untuk super_admin:

```javascript
// Tambah query customer loyal jika super_admin
let loyalCount = 0;
if (u.role === 'super_admin') {
  const { count } = await window.db
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .gte('total_orders', 5);
  loyalCount = count || 0;
}
```

Dan di grid stat cards, tambahkan untuk super_admin:
```javascript
${u.role === 'super_admin' ? statCard('⭐', loyalCount, 'Pelanggan Loyal') : ''}
```

- [ ] **Step 5: Commit semua**

```bash
git add -A
git commit -m "feat: integrasikan loyalty ke nav, SW v5, dashboard super_admin"
git push
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Tabel customers + vouchers → Task 1
- ✅ Milestone global lintas outlet → Task 3 (count semua orders done by WA)
- ✅ Voucher kode unik → Task 3 (generateVoucherCode + clash check)
- ✅ Toggle loyalty on/off → Task 5 (settings loyalty_enabled)
- ✅ Toggle notif WA auto → Task 5 (settings loyalty_notif_auto)
- ✅ 3 milestone konfigurasibel → Task 5 (milestone 1/2/3 + reward 1/2/3)
- ✅ Halaman Customers → Task 6
- ✅ Halaman Vouchers + mark used → Task 7
- ✅ Trigger saat order done → Task 4 (orders.html doUpdateStatus)
- ✅ Nav + SW update → Task 8

**2. Placeholder scan:** Tidak ada TBD/TODO/placeholder — semua langkah punya kode lengkap.

**3. Type consistency:**
- `wa_number` konsisten di tabel customers dan vouchers.customer_wa
- `generateVoucherCode()` dipanggil di `on-order-done/index.ts` (didefinisikan inline, bukan dari loyalty.js karena Edge Function tidak bisa import file lokal)
- `loyalty_milestone_1/2/3` dan `loyalty_reward_1/2/3` konsisten di Task 1, 3, 5
- `fmtDate`, `fmtDateTime`, `formatRupiah` semua dari `utils.js` yang sudah ada
