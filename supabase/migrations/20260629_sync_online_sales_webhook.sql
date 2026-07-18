-- 20260629_sync_pos_sales_webhook.sql
-- Trigger untuk sinkronisasi seketika saat order selesai (realtime ke Dashboard Owner)

-- Pastikan extension pg_net sudah diaktifkan di database Sistem Order ini
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fungsi trigger yang memanggil endpoint `sync-pos-sales` di DB Utama
CREATE OR REPLACE FUNCTION public.tr_sync_pos_sales_to_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Mengirim webhook (POST) ke Edge Function di Dashboard Owner
  -- Endpoint ini bersifat idempoten (menggunakan cursor_date), jadi aman dipanggil berulang
  PERFORM net.http_post(
    url     := 'https://khpkoreaaucvyqfhynfq.functions.supabase.co/sync-online-sales',
    headers := jsonb_build_object(
      -- Menggunakan Service Role Key milik DB Utama (khpkorea...) agar diizinkan
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocGtvcmVhYXVjdnlxZmh5bmZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDk2MzI5MiwiZXhwIjoyMDk2NTM5MjkyfQ.Dy0QMAHfB8EU9BK-JuyRrBidpG6iM94t9RtiJ_viZz8',
      'Content-Type', 'application/json'
    ),
    -- Kita kirimkan ID order yang berubah, meski Edge Function tetap akan
    -- menarik semua perubahan baru menggunakan logic cursor_date
    body    := jsonb_build_object('trigger_order_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hapus trigger jika sudah pernah ada
DROP TRIGGER IF EXISTS orders_sync_pos_sales_trigger ON orders;

-- Pasang trigger di tabel orders: eksekusi ketika status diubah menjadi 'done'
CREATE TRIGGER orders_sync_pos_sales_trigger
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  -- Memastikan trigger hanya jalan tepat saat status BERUBAH menjadi 'done'
  WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'done')
  EXECUTE FUNCTION public.tr_sync_pos_sales_to_admin();
