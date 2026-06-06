-- supabase/migrations/20260606_promo_usage_limit.sql
-- Finalisasi usage limit tracking untuk promos table + auto-disable cron job

-- Add usage limit tracking columns (jika belum ada)
ALTER TABLE public.promos
  ADD COLUMN IF NOT EXISTS usage_limit integer,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.promos.usage_limit IS 'Maximum number of buyers who can use this promo. NULL = unlimited.';
COMMENT ON COLUMN public.promos.usage_count IS 'Current count of buyers who have used this promo (incremented on payment confirmation).';

-- Update existing FK constraint to allow deletion
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_promo_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_promo_id_fkey
    FOREIGN KEY (promo_id)
    REFERENCES public.promos(id)
    ON DELETE SET NULL;

-- Schedule cron job for auto-disabling expired promos
-- Run every hour at :00 minutes
SELECT cron.schedule(
  'auto-disable-expired-promos',
  '0 * * * *',
  $$
  UPDATE public.promos
  SET is_active = false
  WHERE is_active = true AND end_at < now();
  $$
);
