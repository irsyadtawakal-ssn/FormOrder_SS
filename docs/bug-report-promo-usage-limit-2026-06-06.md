# Bug Report — Promo Usage Limit Feature
**Tanggal ditemukan:** 2026-06-06  
**Ditemukan oleh:** Code review otomatis (7-angle static analysis)  
**Status:** ✅ Semua bug sudah diperbaiki dan di-deploy

---

## Ringkasan

Saat fitur **promo usage limit** (batas pembeli per promo) diimplementasi, ditemukan **9 bug laten** yang tersebar di 5 file. Bug-bug ini tidak langsung crash, tapi bisa menyebabkan kecurangan diskon, counter quota yang salah hitung, dan deployment gagal di environment baru.

---

## Daftar Bug

---

### Bug #1 — Polling path tidak pernah increment counter promo

| | |
|---|---|
| **File** | `supabase/functions/check-xendit-status/index.ts` |
| **Severity** | 🔴 Critical |

**Kenapa bisa terjadi:**  
Ada dua cara pembayaran dikonfirmasi: (1) webhook otomatis dari Xendit, dan (2) polling manual saat customer tap "Cek Status Pembayaran". Logika increment `usage_count` hanya ditulis di webhook, tidak di polling.

**Efek:**  
Setiap order yang dikonfirmasi lewat polling — bukan webhook — tidak menghitung quota promo. Kalau promo berbatas 5 pembeli, tapi 3 di antaranya bayar saat webhook lambat, promo tidak pernah auto-disable. Quota bisa terlampaui tanpa diketahui.

**Fix:**  
Tambah blok increment promo (via RPC atomik) di `check-xendit-status` setelah order berhasil diupdate ke `paid`.

---

### Bug #2 — Migration gagal di environment baru karena `cron.unschedule` tanpa error handler

| | |
|---|---|
| **File** | `supabase/migrations/20260606_promo_usage_limit.sql` |
| **Severity** | 🔴 Critical |

**Kenapa bisa terjadi:**  
Baris `SELECT cron.unschedule('auto-disable-expired-promos')` dipanggil tanpa pengecekan apakah job tersebut sudah ada. pg_cron akan melempar error jika job tidak ditemukan.

**Efek:**  
Di environment baru (staging, developer lain, fresh Supabase project), seluruh migration transaction di-abort. Baris `cron.schedule(...)` setelah itu tidak pernah dieksekusi — artinya **cron job auto-disable promo tidak pernah terdaftar** sama sekali, dan promo expired tidak pernah otomatis dimatikan.

**Fix:**  
Bungkus `cron.unschedule` dalam blok `DO $$ BEGIN ... EXCEPTION WHEN OTHERS THEN NULL END $$` agar error diabaikan jika job belum ada.

---

### Bug #3 — Race condition: increment `usage_count` tidak atomik

| | |
|---|---|
| **File** | `supabase/functions/xendit-webhook/index.ts` |
| **Severity** | 🔴 High |

**Kenapa bisa terjadi:**  
Kode lama melakukan dua query terpisah: (1) SELECT `usage_count`, (2) UPDATE dengan nilai `usage_count + 1`. Antara dua query ini ada jeda waktu.

**Efek:**  
Jika dua webhook masuk hampir bersamaan (dua order berbeda pakai promo yang sama), keduanya bisa membaca `usage_count = 4`, keduanya menghitung `newCount = 5`, dan keduanya menulis `5`. Padahal seharusnya `6`. Counter under-count — promo tidak pernah mencapai batas meskipun quota sudah penuh.

**Fix:**  
Buat SQL function `increment_promo_usage(p_promo_id uuid)` yang melakukan `UPDATE ... SET usage_count = usage_count + 1 ... RETURNING` dalam satu operasi atomik. Semua Edge Function sekarang pakai `supabase.rpc("increment_promo_usage", ...)`.

---

### Bug #4 — Dua webhook duplikat bisa lolos idempotency guard dan double-increment counter

| | |
|---|---|
| **File** | `supabase/functions/xendit-webhook/index.ts` |
| **Severity** | 🔴 High |

**Kenapa bisa terjadi:**  
Idempotency check dilakukan dengan membaca `order.status` sebelum UPDATE. Jika dua webhook tiba bersamaan, keduanya membaca `status = 'pending_payment'`, keduanya lolos check, dan keduanya menjalankan increment.

**Efek:**  
`usage_count` ter-increment dua kali untuk satu pembayaran. Promo bisa auto-disable lebih cepat dari seharusnya, atau counter jadi tidak akurat.

**Fix:**  
Tambahkan `.select("id")` pada query UPDATE order, lalu cek apakah ada baris yang benar-benar berubah (`updatedOrder.length === 0`). Jika tidak ada baris yang terupdate, berarti webhook lain sudah menang race — langsung return tanpa increment.

---

### Bug #5 — `usage_limit = 0` dianggap "tidak ada batas" karena falsy check

| | |
|---|---|
| **File** | `supabase/functions/create-xendit-payment/index.ts` |
| **Severity** | 🟠 High |

**Kenapa bisa terjadi:**  
Pengecekan ditulis sebagai `if (promo.usage_limit && ...)`. Dalam JavaScript, angka `0` adalah falsy — sehingga kondisi selalu false untuk `usage_limit = 0`, dan quota check dilewati sepenuhnya.

**Efek:**  
Jika admin tidak sengaja mengisi "Batas pembeli" dengan angka `0`, promo akan berlaku untuk semua customer tanpa batas — seolah quota tidak ada. Diskon terus diberikan tanpa bisa di-disable otomatis.

**Fix:**  
Ganti ke `if (promo.usage_limit != null && promo.usage_count >= promo.usage_limit)`.

---

### Bug #6 — Falsy check yang sama di logika auto-disable webhook

| | |
|---|---|
| **File** | `supabase/functions/xendit-webhook/index.ts` |
| **Severity** | 🟠 High |

**Kenapa bisa terjadi:**  
Pengecekan auto-disable ditulis `if (updatedPromo.usage_limit && ...)` — pola yang sama dengan Bug #5.

**Efek:**  
Promo dengan `usage_limit = 0` tidak pernah di-set `is_active = false` secara otomatis, bahkan setelah banyak pembeli pakai. Promo tetap aktif selamanya.

**Fix:**  
Diganti sekaligus saat refactor ke RPC: `if (usage_limit != null && usage_limit > 0 && usage_count >= usage_limit)`.

---

### Bug #7 — Error dari UPDATE `usage_count` dibuang diam-diam

| | |
|---|---|
| **File** | `supabase/functions/xendit-webhook/index.ts` |
| **Severity** | 🟡 Medium |

**Kenapa bisa terjadi:**  
Destructuring query hanya mengambil `{ data: updatedPromo }` — field `error` tidak didestruktur dan tidak dicek.

**Efek:**  
Jika UPDATE gagal (gangguan DB, masalah RLS, dll), `usage_count` tidak ter-increment, tidak ada log error, tidak ada retry — dan order tetap tercatat sebagai `paid`. Seiring waktu counter bisa under-count secara diam-diam sebanyak jumlah kegagalan tersebut.

**Fix:**  
Refactor ke `supabase.rpc()` yang secara eksplisit cek `error` dan log ke console.

---

### Bug #8 — Division by zero saat `usage_limit = 0`, progress bar tampilkan `NaN%`

| | |
|---|---|
| **File** | `assets/js/admin-promos.js` |
| **Severity** | 🟡 Medium |

**Kenapa bisa terjadi:**  
Guard untuk menampilkan section "Status Penggunaan" hanya mengecek `p.usage_limit != null` — tapi tidak mengecek `> 0`. Ketika `usage_limit = 0`, ekspresi `(p.usage_count / p.usage_limit) * 100` menghasilkan `0/0 = NaN`.

**Efek:**  
Progress bar di modal edit promo menampilkan `width: NaN%` dan teks persentase jadi `NaN%` — tampilan rusak di hadapan admin.

**Fix:**  
Ubah kondisi render menjadi `p.usage_limit != null && p.usage_limit > 0`.

---

### Bug #9 — Promo lama tampilkan `null/10 pembeli` di tabel

| | |
|---|---|
| **File** | `assets/js/admin-promos.js` |
| **Severity** | 🟢 Low |

**Kenapa bisa terjadi:**  
Kolom `usage_count` ditambahkan dengan `DEFAULT 0` — artinya hanya berlaku untuk baris baru. Baris promo yang sudah ada sebelum migration bisa memiliki `usage_count = null` jika tidak di-backfill. Kode render langsung memakai `${p.usage_count}` tanpa null-coalescing.

**Efek:**  
Kolom "Syarat" di tabel admin menampilkan teks `null/10 pembeli` untuk promo lama — terlihat seperti bug oleh admin.

**Fix:**  
Ganti ke `${p.usage_count ?? 0}/${p.usage_limit} pembeli`.

---

## Ringkasan Fix

| # | Bug | File yang Diubah | Jenis Fix |
|---|-----|-----------------|-----------|
| 1 | Polling path tidak increment counter | `check-xendit-status/index.ts` | Tambah blok RPC increment |
| 2 | `cron.unschedule` abort migration | `migrations/20260606_promo_usage_limit.sql` | Bungkus DO EXCEPTION |
| 3 | Race condition non-atomik | `xendit-webhook/index.ts` + migration baru | Buat SQL function atomik |
| 4 | Duplicate webhook double-increment | `xendit-webhook/index.ts` | Cek rows affected dari UPDATE |
| 5 | Falsy-zero di create-payment | `create-xendit-payment/index.ts` | Ganti `&&` ke `!= null` |
| 6 | Falsy-zero di webhook auto-disable | `xendit-webhook/index.ts` | `!= null && > 0` |
| 7 | Error UPDATE dibuang diam-diam | `xendit-webhook/index.ts` | Error handling via RPC |
| 8 | `NaN%` progress bar | `admin-promos.js` | Guard `> 0` |
| 9 | `null/10 pembeli` tabel admin | `admin-promos.js` | Null-coalescing `?? 0` |

---

## File Baru yang Dibuat

- `supabase/migrations/20260606b_promo_usage_rpc.sql` — SQL function `increment_promo_usage(uuid)` untuk increment atomik

---

## Status Deployment

| Komponen | Status |
|----------|--------|
| SQL function `increment_promo_usage` | ✅ Sudah dijalankan di Supabase SQL Editor |
| Edge Function `xendit-webhook` | ✅ Deployed (version baru) |
| Edge Function `check-xendit-status` | ✅ Deployed (version baru) |
| Edge Function `create-xendit-payment` | ✅ Deployed (sebelumnya) |
| Admin JS (`admin-promos.js`) | ✅ Fix tersimpan di repo |
| Migration cron guard | ✅ Di-commit ke repo |
