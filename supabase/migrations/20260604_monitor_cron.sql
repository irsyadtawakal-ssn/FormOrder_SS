-- 20260604_monitor_cron.sql — jadwalkan system-health-monitor tiap 3 menit
-- Jalankan di Supabase SQL Editor
--
-- Prasyarat:
--   1. pg_cron sudah enabled di Supabase Dashboard
--   2. pg_net sudah enabled di Supabase Dashboard
--   3. Edge Function 'system-health-monitor' sudah deployed

-- ─── Enable extension ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Hapus job lama jika ada (idempoten) ─────────────────────────────────────
SELECT cron.unschedule('system-health-monitor')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'system-health-monitor'
);

-- ─── Jadwalkan: tiap 3 menit ──────────────────────────────────────────────────
-- Invoke edge function via HTTP POST dengan Service Role Key untuk autentikasi
SELECT cron.schedule(
  'system-health-monitor',
  '*/3 * * * *',
  $$
  select net.http_post(
    url     := 'https://' || current_setting('app.supabase_url') || '/functions/v1/system-health-monitor',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  ) as response;
  $$
);

-- ─── Verifikasi ───────────────────────────────────────────────────────────────
-- Cek bahwa job terdaftar:
-- SELECT * FROM cron.job WHERE jobname = 'system-health-monitor';
--
-- Lihat history eksekusi:
-- SELECT * FROM cron.job_run_details WHERE jobid IN (
--   SELECT jobid FROM cron.job WHERE jobname = 'system-health-monitor'
-- ) ORDER BY start_time DESC LIMIT 20;
