# Spec: Sistem Promo — SUKA Shawarma Order

> Status: Draft untuk review
> Tanggal: 2026-06-05
> Scope: **Promo/diskon otomatis** (MVP). Service fee per-channel TIDAK termasuk (lihat Roadmap).

---

## 1. Latar Belakang & Tujuan

Admin (super_admin) butuh bisa membuat **promo diskon otomatis** yang berlaku saat
kondisi tertentu terpenuhi, tanpa pelanggan perlu memasukkan kode apa pun. Diskon
dihitung **server-side** (tidak percaya harga dari client), sesuai aturan keamanan proyek.

**Kebutuhan deploy terdekat:** promo "minimal belanja Rp 60.000 → diskon 20%" dengan
periode aktif (tanggal mulai–selesai).

### Yang TIDAK termasuk (out of scope)
- Kode promo / voucher input manual (sudah ada sistem voucher loyalty terpisah).
- Promo bundling / beli-X-gratis-Y.
- Promo per-outlet, happy hour (jam/hari), batas pemakaian.
- Service fee per-channel — fee QRIS saat ini sudah aktif 0,63% dan ditanggung pembeli;
  perbaikan per-channel dicatat di Roadmap, bukan bagian dari spec ini.

Kolom-kolom di tabel `promos` sudah disiapkan untuk fitur roadmap di atas agar penambahan
nanti tidak butuh migrasi besar.

---

## 2. Konteks Kondisi Saat Ini (verified)

- **Harga dihitung server-side** di Edge Function `create-xendit-payment`
  (`subtotal` → `service_fee` → `total`).
- **Service fee SUDAH aktif** di DB produksi: `service_fee_percent = 0.63` (satu angka
  untuk semua channel), digabung diam-diam ke total. (File migrasi `20260522_disable_service_fee.sql`
  menulis `0`, tapi nilai DB produksi sudah diubah jadi `0.63` — DB yang menang.)
- **Promo/diskon: belum ada.**
- Checkout (`checkout.html`) menampilkan keterangan biaya admin per channel sebagai teks
  statis; perhitungan total memakai `service_fee_percent` tunggal.

---

## 3. Data Model

### 3.1 Tabel baru `promos`

```sql
CREATE TABLE public.promos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,                 -- MVP. Nama promo (tampil admin & customer)
  discount_type text NOT NULL DEFAULT 'percent'-- MVP. 'percent' | 'fixed'
                CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric NOT NULL,             -- MVP. 20 (persen) atau 10000 (rupiah)
  min_purchase  bigint NOT NULL DEFAULT 0,     -- MVP. Syarat min subtotal
  max_discount  bigint,                        -- MVP. Batas atas potongan (null = tanpa batas)
  start_at      timestamptz,                   -- MVP. null = langsung aktif
  end_at        timestamptz,                   -- MVP. null = tanpa batas akhir
  is_active     boolean NOT NULL DEFAULT true, -- MVP. Saklar on/off manual
  priority      int NOT NULL DEFAULT 1,        -- MVP. Tie-break jika >1 promo cocok

  -- ── Roadmap (belum dipakai MVP, default aman) ──
  applies_to    text NOT NULL DEFAULT 'all'    -- 'all' | 'outlet' | 'category' | 'item'
                CHECK (applies_to IN ('all','outlet','category','item')),
  outlet_ids    uuid[],                        -- promo per-outlet
  day_of_week   int[],                         -- 0..6 (happy hour)
  time_start    time,
  time_end      time,
  usage_limit   int,                           -- total kuota
  usage_count   int NOT NULL DEFAULT 0,
  per_customer_limit int,                       -- batas per nomor WA
  code          text UNIQUE,                   -- untuk kode promo (fase berikutnya)

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

**Validasi (CHECK / aplikasi):**
- `discount_type='percent'` → `discount_value` antara 1–100.
- `discount_type='fixed'` → `discount_value` > 0.
- `end_at`, jika diisi, harus > `start_at`.

### 3.2 Perubahan tabel `orders`

Tambah 3 kolom:

```sql
ALTER TABLE public.orders
  ADD COLUMN discount   bigint NOT NULL DEFAULT 0,
  ADD COLUMN promo_id   uuid REFERENCES public.promos(id),
  ADD COLUMN promo_name text;   -- snapshot nama promo saat order dibuat
```

`promo_name` di-snapshot agar riwayat order tetap akurat walau promo nanti diubah/dihapus.

### 3.3 RLS

```sql
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;

-- super_admin: full access
CREATE POLICY "promos_super_admin" ON public.promos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users
                 WHERE id = auth.uid() AND role = 'super_admin'));
```

Tidak ada policy SELECT publik/anon — promo dihitung server-side oleh Edge Function
(service role), bukan dibaca langsung dari browser.

---

## 4. Logika Penerapan Diskon

### 4.1 Server (sumber kebenaran) — `create-xendit-payment`

Disisipkan **setelah** `subtotal` selesai dihitung, **sebelum** `service_fee`/`total`:

```
1. Query promo yang valid:
   SELECT * FROM promos
   WHERE is_active = true
     AND (start_at IS NULL OR start_at <= now())
     AND (end_at   IS NULL OR end_at   >= now())
     AND min_purchase <= :subtotal
     AND applies_to = 'all'          -- MVP hanya 'all'
   ORDER BY priority DESC, discount_value DESC
   LIMIT 1

2. Hitung potongan dari promo terpilih (jika ada):
   - percent: discount = round(subtotal * discount_value / 100)
              if max_discount: discount = min(discount, max_discount)
   - fixed:   discount = min(discount_value, subtotal)

3. afterDiscount = subtotal - discount
4. service_fee   = ceil(afterDiscount * feePct)   -- fee dihitung SETELAH diskon
5. total         = afterDiscount + service_fee

6. Simpan ke order: discount, promo_id, promo_name (snapshot name).
7. Kirim balik di response: discount, promo_name, subtotal, service_fee, total.
```

**Aturan:**
- **Hanya 1 promo** per order (tidak ditumpuk). Pemenang = priority tertinggi, lalu
  discount_value tertinggi.
- Jika tidak ada promo cocok → `discount = 0`, `promo_id = null` (perilaku sekarang).
- Diskon tidak boleh membuat `afterDiscount` negatif (dijamin oleh `min(...)` di fixed
  dan `max_discount` di percent; subtotal selalu ≥ min_purchase saat promo cocok).

### 4.2 Client (preview, non-otoritatif) — `checkout.html` / cart

- Hitung estimasi diskon dengan logika sama untuk ditampilkan ke customer
  ("Diskon: −Rp 12.000") sebelum bayar.
- Saat `create-xendit-payment` membalas, **pakai angka dari server** (`discount`/`total`).
  Jika berbeda dari estimasi client, server menang — UI di-update mengikuti response.
- Promo aktif dibaca client lewat query read-only ringan? **Tidak** — untuk MVP, demi
  kesederhanaan & keamanan, preview client boleh memakai endpoint/RPC khusus read-only
  yang mengembalikan promo aktif yang berlaku, ATAU menampilkan diskon hanya setelah
  response server. Keputusan implementasi: **tampilkan diskon dari response server saja**
  (paling aman, tanpa expose tabel promos ke publik). Ringkasan sebelum bayar tetap
  menampilkan subtotal; baris diskon muncul di halaman status setelah order dibuat.

> Catatan: ini berarti customer melihat potongan saat layar pembayaran/total final, bukan
> saat masih di cart. Bila Bos ingin diskon tampil sejak di cart, perlu endpoint read-only
> `get-active-promo` — dicatat sebagai opsi, di luar MVP.

---

## 5. UI Admin — `admin/promos.html`

Halaman baru, akses **super_admin only**, mengikuti pola halaman admin lain.

### 5.1 Menu
- Tambah item "Promo" di sidebar admin.

### 5.2 Daftar Promo
- Kartu/tabel berisi: nama, ringkasan diskon (mis. "20% • min Rp 60.000 • maks Rp 25.000"),
  periode, **status** terhitung:
  - `Nonaktif` — is_active = false
  - `Terjadwal` — is_active true tapi start_at > now
  - `Aktif` — is_active true & dalam periode
  - `Berakhir` — end_at < now
- Toggle on/off cepat (ubah `is_active`).
- Tombol Edit & Hapus.

### 5.3 Form Tambah/Edit
Field MVP:
- Nama promo (text, wajib)
- Tipe diskon: Persen / Nominal (default Persen)
- Nilai diskon (number; %-cap 100 untuk persen)
- Min. belanja (rupiah, default 0)
- Maks. diskon (rupiah, opsional — relevan untuk persen)
- Tanggal mulai (opsional)
- Tanggal selesai (opsional)
- Prioritas (default 1)
- Saklar Aktif (default on)

Field roadmap (per-outlet, hari/jam, batas pakai, kode) **disembunyikan** di MVP.

### 5.4 Validasi form
- Nama tidak kosong.
- Persen: 1–100. Nominal: > 0.
- Jika kedua tanggal diisi, selesai > mulai.

---

## 6. Daftar File Terdampak

| File | Aksi |
|---|---|
| `supabase/migrations/20260605_promos.sql` | **Baru** — tabel promos + kolom orders + RLS |
| `supabase/functions/create-xendit-payment/index.ts` | Edit — query & terapkan promo, fee setelah diskon, simpan & kirim diskon |
| `admin/promos.html` | **Baru** — CRUD promo |
| `admin/*.html` (sidebar) | Edit — tambah menu "Promo" |
| `assets/js/admin.js` (atau setara) | Edit — logika CRUD promos |
| `checkout.html` / `order.html` | Edit — tampilkan baris diskon dari response server |
| `Plans.md` | Edit — catat fase promo |

---

## 7. Roadmap (di luar MVP, kolom sudah disiapkan)

1. **Service fee per-channel** — ganti `service_fee_percent` tunggal jadi fee per channel
   (QRIS ~1%, VA Rp 4.500, e-wallet 2%) sesuai `docs/xendit-fee-structure.md`. Penting bila
   channel VA/e-wallet diaktifkan agar Bos tidak nombok.
2. **Promo per-outlet** (`applies_to='outlet'`, `outlet_ids`).
3. **Happy hour** (`day_of_week`, `time_start`/`time_end`).
4. **Batas pemakaian** (`usage_limit`, `per_customer_limit`).
5. **Kode promo** (`code`) — input manual di checkout.
6. **Bundling / beli-X-gratis-Y**.
7. **Preview diskon sejak di cart** via endpoint read-only `get-active-promo`.

---

## 8. Contoh Perhitungan (acuan)

Promo: min Rp 60.000 → diskon 20%, tanpa max_discount. Bayar QRIS (fee 0,63%).

```
Subtotal              Rp 70.000
Diskon 20%           − Rp 14.000
─────────────────────────────────
Setelah diskon         Rp 56.000
Service fee 0,63%     + Rp    353
─────────────────────────────────
Total bayar           Rp 56.353
```
(Jika subtotal < Rp 60.000 → tidak ada diskon, total = subtotal + fee seperti sekarang.)
