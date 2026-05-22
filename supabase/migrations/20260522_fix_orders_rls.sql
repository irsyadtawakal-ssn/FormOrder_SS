-- Fix: pastikan anon (customer) bisa SELECT orders untuk status page
-- Jalankan di Supabase SQL Editor jika halaman order.html tidak bisa load order

-- Hapus policy lama dan buat ulang (idempoten)
DROP POLICY IF EXISTS "orders_public_select" ON orders;
CREATE POLICY "orders_public_select" ON orders FOR SELECT USING (true);

-- Verifikasi: cek semua policy aktif di tabel orders
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'orders';
