-- Arahkan cron auto-cancel ke edge function (yang mengecek Xendit dulu).
--
-- Sebelumnya cron jobid 1 menjalankan SQL langsung:
--   UPDATE orders SET status='expired' ... WHERE status='pending_payment' AND expires_at < now();
-- tanpa masa tenggang dan tanpa bertanya ke Xendit → pesanan yang SUDAH dibayar
-- tapi halamannya ditutup pelanggan ikut ditandai expired (insiden Okt–Nov 2026).
--
-- Edge function auto-cancel-expired-orders (v21) menanyakan status payment
-- request ke Xendit dulu; yang SUCCEEDED dipulihkan lewat check-xendit-status.
--
-- Prasyarat: service role key tersimpan di vault dengan nama 'service_role_key'.
-- Kalau belum ada, migration ini membatalkan diri (cron lama tetap jalan).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key') THEN
    RAISE EXCEPTION 'vault secret service_role_key belum ada — cron TIDAK diubah';
  END IF;
END $$;

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'auto-cancel-expired-orders'),
  command := $cmd$
  select net.http_post(
    url     := 'https://qntuhtkujpwudcpudwbj.supabase.co/functions/v1/auto-cancel-expired-orders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cmd$
);

-- Pembalik (kembali ke cron SQL lama):
-- SELECT cron.alter_job(
--   job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'auto-cancel-expired-orders'),
--   command := $cmd$
--   UPDATE orders
--   SET status = 'expired', cancelled_at = now(), cancel_reason = 'Batas waktu pembayaran habis (otomatis)'
--   WHERE status = 'pending_payment' AND expires_at < now();
--   $cmd$
-- );
