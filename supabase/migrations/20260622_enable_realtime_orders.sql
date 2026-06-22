-- Aktifkan Supabase Realtime publication untuk tabel orders.
-- Tanpa ini, OnlineOrderSync di POS Kasir (postgres_changes subscription)
-- tidak pernah menerima event apa pun — order baru/paid hanya tertarik
-- saat halaman /kasir di-reload (lewat initial sync), bukan secara live.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;
