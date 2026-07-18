-- Fix webhook URL and payload format to match what Admin Dashboard expects
CREATE OR REPLACE FUNCTION public.tr_sync_pos_sales_to_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Mengirim webhook (POST) ke Edge Function di Dashboard Owner
  PERFORM net.http_post(
    url     := 'https://khpkoreaaucvyqfhynfq.functions.supabase.co/webhook-sync-order',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocGtvcmVhYXVjdnlxZmh5bmZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDk2MzI5MiwiZXhwIjoyMDk2NTM5MjkyfQ.Dy0QMAHfB8EU9BK-JuyRrBidpG6iM94t9RtiJ_viZz8',
      'Content-Type', 'application/json'
    ),
    body    := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'orders',
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
