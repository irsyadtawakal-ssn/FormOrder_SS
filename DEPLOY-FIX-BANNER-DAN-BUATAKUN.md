# Panduan Deploy — Fix Banner HP & Bug "Buat Akun"

Semua perbaikan sudah ada di kode. Tinggal **terapkan ke produksi** lalu **buktikan di HP**.
Ada 2 bagian: (A) file statis ke Hostinger, (B) setelan Edge Function di Supabase.

---

## BAGIAN A — Deploy file statis ke Hostinger (fix banner HP)

File yang berubah dan harus di-upload ke `/public_html/order/`:

| File | Lokasi tujuan di server |
|------|--------------------------|
| `index.html` | `/public_html/order/index.html` |
| `sw.js` | `/public_html/order/sw.js` |
| `order.html` | `/public_html/order/order.html` |
| `admin/settings.html` | `/public_html/order/admin/settings.html` |

### Cara 1 — Hostinger File Manager (paling mudah, tanpa app)
1. Login [hPanel Hostinger](https://hpanel.hostinger.com) → **Files** → **File Manager**
2. Masuk ke folder `public_html/order/`
3. Upload `index.html`, `sw.js`, `order.html` (timpa yang lama → **Replace**)
4. Masuk ke subfolder `admin/` → upload `settings.html` (Replace)

### Cara 2 — FTP (FileZilla)
1. hPanel → **Files** → **FTP Accounts** → catat host, username, password
2. Buka FileZilla → connect → drag 4 file di atas ke `public_html/order/` (dan `admin/`)

### Setelah upload — WAJIB
1. Buka **Admin → Settings** sekali di laptop. Fungsi **auto-heal** akan otomatis
   mengecilkan banner lama yang kebesaran (muncul toast "Gambar dioptimalkan otomatis").
2. Buka `https://order.sukashawarma.com` di **HP** → banner harus muncul.
   - Service Worker sudah `network-first` + cache `v11`, jadi HP otomatis ambil versi baru.
   - Kalau masih versi lama: tutup semua tab situs di HP, buka lagi (sekali saja).

---

## BAGIAN B — Fix bug "Buat Akun" (CORS / Verify JWT) di Supabase

Penyebab: fungsi `create-admin-user` punya **Verify JWT = ON**, jadi request preflight
OPTIONS (tanpa token) ditolak gateway → CORS gagal. Fungsi sudah cek super_admin sendiri,
jadi aman dimatikan.

### Cara tercepat — Dashboard (~20 detik, tanpa CLI)
1. [Supabase Dashboard](https://supabase.com/dashboard) → pilih project **`qntuhtkujpwudcpudwbj`**
   (INI project produksi — lihat `config.js`. JANGAN pilih project lain.)
2. **Edge Functions** → **create-admin-user** → **Details / Settings**
3. Matikan **"Enforce JWT Verification"** (Verify JWT → OFF) → Save
4. Buka Admin → Pengguna → **Buat Akun** → harus berhasil ✅

### Alternatif — CLI
```bash
supabase functions deploy create-admin-user \
  --project-ref qntuhtkujpwudcpudwbj \
  --no-verify-jwt
```

---

## ⚠️ PENTING: CLI ter-link ke project yang SALAH

CLI di komputermu ter-link ke `ipwkiizicobqdpfcmgvc`, tapi situs produksi pakai
`qntuhtkujpwudcpudwbj`. Artinya: kalau selama ini deploy fungsi tanpa `--project-ref`,
hasilnya masuk ke project SALAH dan produksi tak pernah berubah. Relink dulu:

```bash
supabase link --project-ref qntuhtkujpwudcpudwbj
```

File `supabase/config.toml` (baru) sudah mengunci `project_id` yang benar +
`verify_jwt = false` untuk `create-admin-user`, jadi deploy berikutnya otomatis benar.

---

## Checklist verifikasi akhir
- [ ] 4 file statis ter-upload ke `/public_html/order/`
- [ ] Buka Admin → Settings sekali (auto-heal jalan)
- [ ] Banner muncul di HP ✅
- [ ] Verify JWT `create-admin-user` = OFF
- [ ] "Buat Akun" berhasil tanpa error CORS ✅
