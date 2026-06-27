-- 20260626_sync_status_webhook.sql
-- Trigger untuk sinkronisasi perubahan status order ('done', 'cancelled') ke POS Kasir

-- Buat extension pg_net jika belum ada (untuk net.http_post)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fungsi trigger untuk memanggil Edge Function sync-status-to-pos
CREATE OR REPLACE FUNCTION public.tr_sync_order_status_to_pos()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://' || current_setting('app.supabase_url') || '/functions/v1/sync-status-to-pos',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body    := jsonb_build_object('order_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Buat trigger pada tabel orders
DROP TRIGGER IF EXISTS orders_sync_status_trigger ON orders;
CREATE TRIGGER orders_sync_status_trigger
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('done', 'cancelled'))
  EXECUTE FUNCTION public.tr_sync_order_status_to_pos();
