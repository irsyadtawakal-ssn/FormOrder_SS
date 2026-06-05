# Sistem Promo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambah promo diskon otomatis yang bisa dikelola admin (super_admin), dihitung server-side, dengan kondisi minimal belanja + periode aktif.

**Architecture:** Tabel `promos` baru (kolom MVP + kolom roadmap disiapkan). Edge Function `create-xendit-payment` memilih 1 promo valid terbaik dan menerapkan diskon sebelum service fee. Halaman admin `admin/promos.html` untuk CRUD. Diskon disnapshot ke `orders` dan ditampilkan di halaman status.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions/Deno), Vanilla HTML/CSS/JS, Supabase JS SDK via CDN.

**Catatan testing:** Proyek ini tidak punya test runner (vanilla JS, no build). Verifikasi memakai: SQL query di Supabase SQL Editor, invoke Edge Function via `curl`, dan pengecekan manual di browser. Setiap task punya langkah verifikasi konkret.

**Spec:** `docs/superpowers/specs/2026-06-05-promo-system-design.md`

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `supabase/migrations/20260605_promos.sql` | Skema tabel `promos`, kolom diskon di `orders`, RLS |
| `supabase/functions/create-xendit-payment/index.ts` | Query + terapkan promo, hitung fee setelah diskon, simpan & kirim diskon |
| `admin/promos.html` | UI CRUD promo (super_admin only) |
| `admin/*.html` | Tambah link "Promo" di sidebar & bottom-nav |
| `order.html` | Tampilkan baris diskon dari data order |
| `Plans.md` | Catat fase promo |

---

## Task 1: Migrasi database

**Files:**
- Create: `supabase/migrations/20260605_promos.sql`

- [ ] **Step 1: Tulis file migrasi**

```sql
-- supabase/migrations/20260605_promos.sql
-- Sistem promo diskon otomatis SUKA Shawarma

-- ── Tabel promos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  discount_type  text NOT NULL DEFAULT 'percent'
                 CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric NOT NULL,
  min_purchase   bigint NOT NULL DEFAULT 0,
  max_discount   bigint,
  start_at       timestamptz,
  end_at         timestamptz,
  is_active      boolean NOT NULL DEFAULT true,
  priority       int NOT NULL DEFAULT 1,

  -- Roadmap (belum dipakai MVP)
  applies_to     text NOT NULL DEFAULT 'all'
                 CHECK (applies_to IN ('all','outlet','category','item')),
  outlet_ids     uuid[],
  day_of_week    int[],
  time_start     time,
  time_end       time,
  usage_limit    int,
  usage_count    int NOT NULL DEFAULT 0,
  per_customer_limit int,
  code           text UNIQUE,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT promo_value_positive CHECK (discount_value > 0),
  CONSTRAINT promo_percent_max CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CONSTRAINT promo_period_valid CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
);

-- ── Kolom diskon di orders ───────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount   bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_id   uuid REFERENCES public.promos(id),
  ADD COLUMN IF NOT EXISTS promo_name text;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promos_super_admin" ON public.promos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users
                 WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users
                 WHERE id = auth.uid() AND role = 'super_admin'));
```

- [ ] **Step 2: Jalankan migrasi**

Buka Supabase SQL Editor → paste isi file → Run.
(Atau `supabase db push` jika CLI tersambung ke project.)

- [ ] **Step 3: Verifikasi tabel & kolom**

Run di SQL Editor:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'promos' ORDER BY ordinal_position;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders' AND column_name IN ('discount','promo_id','promo_name');
```
Expected: tabel `promos` punya semua kolom; `orders` punya `discount`, `promo_id`, `promo_name`.

- [ ] **Step 4: Insert promo uji (untuk task berikutnya)**

```sql
INSERT INTO public.promos (name, discount_type, discount_value, min_purchase, is_active)
VALUES ('Uji Diskon 20%', 'percent', 20, 60000, true);
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260605_promos.sql
git commit -m "Promo: migrasi tabel promos + kolom diskon orders"
```

---

## Task 2: Terapkan diskon di Edge Function

**Files:**
- Modify: `supabase/functions/create-xendit-payment/index.ts`

Konteks: blok `Server-side reprice` menghasilkan `subtotal` (sekitar baris 301-351),
lalu menghitung `serviceFee` & `total` (baris 353-354), lalu INSERT order (baris 395+).

- [ ] **Step 1: Tambah query + perhitungan diskon SETELAH loop subtotal, SEBELUM serviceFee**

Cari baris (sekitar 353):
```ts
  const serviceFee = Math.ceil(subtotal * feePct);
  const total = subtotal + serviceFee;
```

Ganti menjadi:
```ts
  // ─── Cari & terapkan promo otomatis ──────────────────────────────────────
  let discount = 0;
  let promoId: string | null = null;
  let promoName: string | null = null;

  const nowIso = new Date().toISOString();
  const { data: promoRows } = await supabase
    .from("promos")
    .select("id, name, discount_type, discount_value, max_discount, min_purchase")
    .eq("is_active", true)
    .eq("applies_to", "all")
    .lte("min_purchase", subtotal)
    .or(`start_at.is.null,start_at.lte.${nowIso}`)
    .or(`end_at.is.null,end_at.gte.${nowIso}`)
    .order("priority", { ascending: false })
    .order("discount_value", { ascending: false })
    .limit(1);

  const promo = promoRows?.[0];
  if (promo) {
    if (promo.discount_type === "percent") {
      discount = Math.round(subtotal * Number(promo.discount_value) / 100);
      if (promo.max_discount != null) {
        discount = Math.min(discount, Number(promo.max_discount));
      }
    } else {
      discount = Math.min(Number(promo.discount_value), subtotal);
    }
    discount = Math.max(0, discount);
    promoId = promo.id;
    promoName = promo.name;
  }

  const afterDiscount = subtotal - discount;
  const serviceFee = Math.ceil(afterDiscount * feePct);
  const total = afterDiscount + serviceFee;
```

> Catatan: dua filter `.or(...)` di atas digabung sebagai AND oleh PostgREST (masing-masing
> grup OR independen), sehingga logikanya: (start null ATAU start<=now) DAN (end null ATAU end>=now).

- [ ] **Step 2: Simpan diskon ke order saat INSERT**

Cari objek `.insert({ ... })` order (sekitar baris 397), tambahkan 3 field setelah `subtotal,`:
```ts
      subtotal,
      discount,
      promo_id: promoId,
      promo_name: promoName,
      service_fee: serviceFee,
```

- [ ] **Step 3: Kirim diskon di response ke frontend**

Cari blok `return json({ ... })` terakhir (sekitar baris 521), tambahkan di dekat `total`:
```ts
    total,
    subtotal,
    discount,
    promo_name: promoName,
    service_fee: serviceFee,
```

- [ ] **Step 4: Deploy function**

```bash
supabase functions deploy create-xendit-payment
```

- [ ] **Step 5: Verifikasi via curl (subtotal ≥ 60.000 → diskon 20%)**

Pastikan promo uji dari Task 1 masih ada. Kirim order uji dengan item yang
subtotalnya ≥ Rp 60.000 (sesuaikan `outlet_slug` & `menu_item_id` dengan data nyata):
```bash
curl -X POST "https://<PROJECT>.supabase.co/functions/v1/create-xendit-payment" \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"outlet_slug":"<slug>","payment_channel":"QRIS","customer_name":"Tes Promo","customer_wa":"08123456789","pickup_time":"Sekarang","items":[{"menu_item_id":"<id>","quantity":3}]}'
```
Expected JSON memuat: `"discount"` > 0, `"promo_name":"Uji Diskon 20%"`, dan
`total` = `subtotal - discount + service_fee`.

- [ ] **Step 6: Verifikasi order tersimpan dengan diskon**

```sql
SELECT order_number, subtotal, discount, promo_name, service_fee, total
FROM orders ORDER BY created_at DESC LIMIT 1;
```
Expected: `discount` terisi, `total = subtotal - discount + service_fee`.

- [ ] **Step 7: Verifikasi order TANPA promo (subtotal < 60.000)**

Kirim curl serupa dengan subtotal < Rp 60.000.
Expected: `"discount":0`, `"promo_name":null`, `total = subtotal + service_fee`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/create-xendit-payment/index.ts
git commit -m "Promo: terapkan diskon otomatis di create-xendit-payment"
```

---

## Task 3: Halaman admin promo

**Files:**
- Create: `admin/promos.html`
- Modify: sidebar & bottom-nav di halaman admin (lihat Step 6)

- [ ] **Step 1: Buat `admin/promos.html` — kerangka + daftar**

```html
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Promo — SUKA Admin</title>
<link rel="stylesheet" href="../assets/css/style.css?v=7" />
<link rel="stylesheet" href="../assets/css/admin-desktop.css?v=7" />
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
      <a href="/admin/monitoring.html" class="admin-only"><span>🔍</span><span>Monitoring</span></a>
      <a href="/admin/customers.html" class="admin-only"><span>🧑‍🤝‍🧑</span><span>Pelanggan</span></a>
      <a href="/admin/vouchers.html" class="admin-only"><span>🎟️</span><span>Voucher</span></a>
      <a href="/admin/promos.html" class="admin-only active"><span>🏷️</span><span>Promo</span></a>
      <a href="/admin/outlets.html" class="admin-only"><span>📍</span><span>Outlet</span></a>
      <a href="/admin/users.html" class="admin-only"><span>👥</span><span>Pengguna</span></a>
      <a href="/admin/settings.html" class="admin-only"><span>⚙️</span><span>Pengaturan</span></a>
    </nav>
    <div class="admin-sidebar-footer">
      <button onclick="adminSignOut()">🚪 Keluar</button>
    </div>
  </aside>

  <div class="topbar">
    <span class="topbar-title">🏷️ Promo</span>
    <span id="adminName" style="font-size:12px;color:var(--muted)"></span>
  </div>

  <div class="admin-content">
    <div style="padding:8px 12px">
      <button class="btn btn-primary" style="width:100%" onclick="openPromoForm()">+ Tambah Promo</button>
    </div>
    <div id="summaryBar" style="padding:4px 12px 8px;font-size:12px;color:var(--muted)">—</div>
    <div style="overflow-x:auto;padding-bottom:80px">
      <table class="report-table" id="promoTable">
        <thead>
          <tr>
            <th style="text-align:left">Promo</th>
            <th style="text-align:left">Syarat</th>
            <th style="text-align:center">Status</th>
          </tr>
        </thead>
        <tbody id="promoBody">
          <tr><td colspan="3" class="report-empty">Memuat…</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <nav class="admin-nav">
    <a href="/admin/index.html"><span>🏠</span><span>Dashboard</span></a>
    <a href="/admin/orders.html"><span>📋</span><span>Pesanan</span></a>
    <a href="/admin/menu.html"><span>🌯</span><span>Menu</span></a>
    <a href="/admin/promos.html" class="admin-only"><span>🏷️</span><span>Promo</span></a>
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
<script src="../assets/js/admin-promos.js"></script>
</body>
</html>
```

- [ ] **Step 2: Buat `assets/js/admin-promos.js` — init + load + render**

```js
// admin-promos.js — CRUD promo (super_admin only)
let allPromos = [];

(async function init() {
  const u = await requireAuth();
  if (!u) return;
  if (u.role !== 'super_admin') {
    document.querySelector('.admin-content').innerHTML =
      '<p style="padding:32px;text-align:center;color:var(--muted)">Akses terbatas untuk Super Admin.</p>';
    return;
  }
  await loadPromos();
})();

async function loadPromos() {
  const { data, error } = await window.db
    .from('promos')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { showToast('Gagal memuat promo'); return; }
  allPromos = data || [];
  renderPromos();
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function rupiah(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

function promoStatus(p) {
  const now = Date.now();
  if (!p.is_active) return { label: 'Nonaktif', bg: '#f3f4f6', fg: 'var(--muted)' };
  if (p.start_at && new Date(p.start_at).getTime() > now)
    return { label: 'Terjadwal', bg: '#fef3c7', fg: '#b45309' };
  if (p.end_at && new Date(p.end_at).getTime() < now)
    return { label: 'Berakhir', bg: '#f3f4f6', fg: 'var(--muted)' };
  return { label: 'Aktif', bg: '#dcfce7', fg: '#16a34a' };
}

function discountSummary(p) {
  const val = p.discount_type === 'percent' ? `${p.discount_value}%` : rupiah(p.discount_value);
  const parts = [val, `min ${rupiah(p.min_purchase)}`];
  if (p.max_discount != null) parts.push(`maks ${rupiah(p.max_discount)}`);
  return parts.join(' • ');
}

function renderPromos() {
  document.getElementById('summaryBar').textContent =
    `${allPromos.length} promo · ${allPromos.filter(p => promoStatus(p).label === 'Aktif').length} aktif`;
  const tbody = document.getElementById('promoBody');
  if (!allPromos.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="report-empty">Belum ada promo. Klik "Tambah Promo".</td></tr>';
    return;
  }
  tbody.innerHTML = allPromos.map(p => {
    const s = promoStatus(p);
    const badge = `<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${s.bg};color:${s.fg}">${s.label}</span>`;
    return `
      <tr style="cursor:pointer" onclick="openPromoForm('${p.id}')">
        <td><div style="font-weight:700">${escHtml(p.name)}</div></td>
        <td><div style="font-size:12px;color:var(--muted)">${discountSummary(p)}</div></td>
        <td style="text-align:center">${badge}</td>
      </tr>`;
  }).join('');
}
```

- [ ] **Step 3: Tambah form tambah/edit ke `admin-promos.js`**

```js
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openPromoForm(id) {
  const p = id ? allPromos.find(x => x.id === id) : null;
  openAdminModal(`
    <div class="modal-header">
      <span>🏷️ ${p ? 'Edit' : 'Tambah'} Promo</span>
      <button onclick="closeAdminModal()" class="btn-icon">✕</button>
    </div>
    <div class="modal-body">
      <label class="form-label">Nama promo</label>
      <input id="pName" class="form-input" value="${p ? escHtml(p.name) : ''}" placeholder="mis. Diskon Gajian 20%" />

      <label class="form-label">Tipe diskon</label>
      <select id="pType" class="form-input">
        <option value="percent" ${p && p.discount_type==='percent' ? 'selected':''}>Persen (%)</option>
        <option value="fixed" ${p && p.discount_type==='fixed' ? 'selected':''}>Nominal (Rp)</option>
      </select>

      <label class="form-label">Nilai diskon</label>
      <input id="pValue" type="number" class="form-input" value="${p ? p.discount_value : ''}" placeholder="20" />

      <label class="form-label">Min. belanja (Rp)</label>
      <input id="pMin" type="number" class="form-input" value="${p ? p.min_purchase : 0}" placeholder="60000" />

      <label class="form-label">Maks. diskon (Rp, opsional)</label>
      <input id="pMax" type="number" class="form-input" value="${p && p.max_discount != null ? p.max_discount : ''}" placeholder="kosong = tanpa batas" />

      <label class="form-label">Mulai (opsional)</label>
      <input id="pStart" type="datetime-local" class="form-input" value="${p ? toLocalInput(p.start_at) : ''}" />

      <label class="form-label">Selesai (opsional)</label>
      <input id="pEnd" type="datetime-local" class="form-input" value="${p ? toLocalInput(p.end_at) : ''}" />

      <label class="form-label">Prioritas</label>
      <input id="pPriority" type="number" class="form-input" value="${p ? p.priority : 1}" />

      <label style="display:flex;align-items:center;gap:8px;margin-top:12px">
        <input id="pActive" type="checkbox" ${!p || p.is_active ? 'checked':''} /> Aktif
      </label>

      <button class="btn btn-primary" style="width:100%;margin-top:16px" onclick="savePromo('${p ? p.id : ''}')">💾 Simpan</button>
      ${p ? `<button class="btn" style="width:100%;margin-top:8px;color:#dc2626" onclick="deletePromo('${p.id}')">🗑️ Hapus</button>` : ''}
    </div>
  `);
}

async function savePromo(id) {
  const name = document.getElementById('pName').value.trim();
  const type = document.getElementById('pType').value;
  const value = Number(document.getElementById('pValue').value);
  const min = Number(document.getElementById('pMin').value || 0);
  const maxRaw = document.getElementById('pMax').value;
  const startRaw = document.getElementById('pStart').value;
  const endRaw = document.getElementById('pEnd').value;
  const priority = Number(document.getElementById('pPriority').value || 1);
  const isActive = document.getElementById('pActive').checked;

  if (!name) { showToast('Nama promo wajib diisi'); return; }
  if (!(value > 0)) { showToast('Nilai diskon harus > 0'); return; }
  if (type === 'percent' && value > 100) { showToast('Diskon persen maks 100'); return; }
  if (startRaw && endRaw && new Date(endRaw) <= new Date(startRaw)) {
    showToast('Tanggal selesai harus setelah mulai'); return;
  }

  const payload = {
    name, discount_type: type, discount_value: value, min_purchase: min,
    max_discount: maxRaw === '' ? null : Number(maxRaw),
    start_at: startRaw ? new Date(startRaw).toISOString() : null,
    end_at: endRaw ? new Date(endRaw).toISOString() : null,
    priority, is_active: isActive, updated_at: new Date().toISOString(),
  };

  const q = id
    ? window.db.from('promos').update(payload).eq('id', id)
    : window.db.from('promos').insert(payload);
  const { error } = await q;
  if (error) { showToast('Gagal menyimpan: ' + error.message); return; }
  showToast('Promo disimpan');
  closeAdminModal();
  await loadPromos();
}

async function deletePromo(id) {
  if (!confirm('Hapus promo ini?')) return;
  const { error } = await window.db.from('promos').delete().eq('id', id);
  if (error) { showToast('Gagal menghapus: ' + error.message); return; }
  showToast('Promo dihapus');
  closeAdminModal();
  await loadPromos();
}
```

- [ ] **Step 4: Verifikasi tambah promo di browser**

Buka `admin/promos.html` (login super_admin). Klik "+ Tambah Promo", isi
Nama "Diskon Gajian", Persen 20, Min 60000, Aktif → Simpan.
Expected: toast "Promo disimpan", baris muncul di tabel dengan badge "Aktif".

- [ ] **Step 5: Verifikasi edit, toggle nonaktif, hapus**

Klik baris promo → ubah ke nonaktif → Simpan → badge jadi "Nonaktif".
Klik lagi → Hapus → baris hilang.
Cek juga promo dengan `start_at` di masa depan → badge "Terjadwal".

- [ ] **Step 6: Tambah link "Promo" di sidebar & bottom-nav halaman admin lain**

Di tiap file admin (`admin/index.html`, `orders.html`, `menu.html`, `reports.html`,
`monitoring.html`, `customers.html`, `vouchers.html`, `outlets.html`, `users.html`,
`settings.html`), tambahkan link sidebar tepat setelah baris Voucher:
```html
      <a href="/admin/promos.html" class="admin-only"><span>🏷️</span><span>Promo</span></a>
```
(Tanpa `active`, kecuali di file yang sedang aktif.)

- [ ] **Step 7: Hapus promo uji dari Task 1 (jika belum)**

```sql
DELETE FROM promos WHERE name = 'Uji Diskon 20%';
```

- [ ] **Step 8: Commit**

```bash
git add admin/promos.html assets/js/admin-promos.js admin/*.html
git commit -m "Promo: halaman admin CRUD + link sidebar"
```

---

## Task 4: Tampilkan diskon di halaman status order

**Files:**
- Modify: `order.html`

Konteks: `order.html` menampilkan rincian order ("Detail Pesanan"). Diskon perlu
muncul sebagai baris terpisah bila `order.discount > 0`.

- [ ] **Step 1: Temukan tempat render rincian harga di `order.html`**

Run: cari di `order.html` baris yang menampilkan subtotal/total order (mis. teks
"Subtotal" atau pemanggilan `formatRupiah`/`rupiah` untuk total order).

- [ ] **Step 2: Tambah baris diskon di rincian**

Di blok rincian harga (setelah Subtotal, sebelum Total), sisipkan — sesuaikan nama
variabel order dengan yang dipakai file (`o` / `order`):
```js
${o.discount > 0 ? `
  <div class="summary-row" style="color:#16a34a">
    <span>Diskon${o.promo_name ? ' — ' + escHtml(o.promo_name) : ''}</span>
    <span>−${formatRupiah(o.discount)}</span>
  </div>` : ''}
```
Pastikan query order di `order.html` ikut mengambil kolom `discount, promo_name`
(jika memakai `select('*')` sudah otomatis termasuk).

- [ ] **Step 3: Verifikasi di browser**

Buka `order.html?order=<order_number_yang_ada_diskon>` (pakai order uji dari Task 2).
Expected: baris "Diskon — <nama promo>" tampil hijau dengan nilai negatif, dan
Total = Subtotal − Diskon + Biaya admin.

- [ ] **Step 4: Verifikasi order tanpa diskon tidak menampilkan baris**

Buka order tanpa diskon. Expected: tidak ada baris "Diskon".

- [ ] **Step 5: Commit**

```bash
git add order.html
git commit -m "Promo: tampilkan baris diskon di halaman status order"
```

---

## Task 5: Catat fase di Plans.md

**Files:**
- Modify: `Plans.md`

- [ ] **Step 1: Tambah entri fase promo**

Tambahkan section baru di `Plans.md` mengikuti format fase yang ada:
```markdown
## Phase: Sistem Promo (2026-06-05)
- [x] Migrasi tabel `promos` + kolom diskon `orders`
- [x] Diskon otomatis di Edge Function `create-xendit-payment`
- [x] Halaman admin `admin/promos.html` (CRUD)
- [x] Tampilkan diskon di `order.html`
- Roadmap: service fee per-channel, promo per-outlet, happy hour, batas pakai, kode promo, bundling
- Spec: `docs/superpowers/specs/2026-06-05-promo-system-design.md`
```

- [ ] **Step 2: Commit**

```bash
git add Plans.md
git commit -m "Promo: catat fase di Plans.md"
```

---

## Catatan Verifikasi Akhir

Skenario end-to-end (manual) setelah semua task:
1. Buat promo "min 60rb → 20%" aktif di `admin/promos.html`.
2. Buat order via web dengan subtotal ≥ Rp 60.000, channel QRIS.
3. Cek layar pembayaran/status: total = subtotal − 20% + fee 0,63%, baris diskon tampil.
4. Cek di DB `orders`: `discount`, `promo_name` terisi benar.
5. Buat order subtotal < Rp 60.000 → tidak ada diskon.
6. Nonaktifkan promo → order baru tidak dapat diskon.
