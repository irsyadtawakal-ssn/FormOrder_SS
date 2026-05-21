-- Migration: setup pg_cron untuk auto-cancel expired orders
-- Jalankan di Supabase SQL Editor
--
-- Prasyarat: aktifkan pg_cron di Supabase Dashboard
--   → Database → Extensions → pg_cron → Enable

-- ─── Enable pg_cron ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── Hapus job lama jika ada (idempoten) ──────────────────────────────────────
SELECT cron.unschedule('auto-cancel-expired-orders')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-cancel-expired-orders'
);

-- ─── Jadwalkan: tiap 1 menit ──────────────────────────────────────────────────
-- Langsung UPDATE via SQL — tidak perlu pg_net atau secrets di SQL
SELECT cron.schedule(
  'auto-cancel-expired-orders',
  '* * * * *',
  $$
  UPDATE orders
  SET
    status        = 'expired',
    cancelled_at  = now(),
    cancel_reason = 'Batas waktu pembayaran habis (otomatis)'
  WHERE status    = 'pending_payment'
    AND expires_at < now();
  $$
);

-- ─── Verifikasi ───────────────────────────────────────────────────────────────
-- Cek bahwa job terdaftar:
-- SELECT * FROM cron.job WHERE jobname = 'auto-cancel-expired-orders';
--
-- Lihat history eksekusi:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
