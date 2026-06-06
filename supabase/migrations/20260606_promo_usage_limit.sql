-- Finalisasi usage limit tracking untuk promos table + auto-disable cron job
-- Kolom usage_limit dan usage_count sudah ditambahkan di migration 20260605

-- Add comments for clarity
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

-- Create index on FK column for performance
CREATE INDEX IF NOT EXISTS idx_orders_promo_id ON public.orders(promo_id);

-- Schedule cron job for auto-disabling expired promos
-- Run every hour at :00 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('auto-disable-expired-promos');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job belum ada di environment baru, lanjut ke schedule
END $$;

SELECT cron.schedule(
  'auto-disable-expired-promos',
  '0 * * * *',
  $$
  UPDATE public.promos
  SET is_active = false
  WHERE is_active = true AND end_at < now();
  $$
);
