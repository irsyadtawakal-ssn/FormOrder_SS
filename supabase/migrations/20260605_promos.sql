-- supabase/migrations/20260605_promos.sql
-- Sistem promo diskon otomatis SUKA Shawarma

-- ── Tabel promos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  discount_type  text NOT NULL DEFAULT 'percent'
                 CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric NOT NULL,
  min_purchase   bigint NOT NULL DEFAULT 0,
  max_discount   bigint,
  start_at       timestamptz,
  end_at         timestamptz,
  is_active      boolean NOT NULL DEFAULT true,
  priority       int NOT NULL DEFAULT 1,

  -- Roadmap (belum dipakai MVP)
  applies_to     text NOT NULL DEFAULT 'all'
                 CHECK (applies_to IN ('all','outlet','category','item')),
  outlet_ids     uuid[],
  day_of_week    int[],
  time_start     time,
  time_end       time,
  usage_limit    int,
  usage_count    int NOT NULL DEFAULT 0,
  per_customer_limit int,
  code           text UNIQUE,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT promo_value_positive CHECK (discount_value > 0),
  CONSTRAINT promo_percent_max CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CONSTRAINT promo_period_valid CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at)
);

-- ── Kolom diskon di orders ───────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount   bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_id   uuid REFERENCES public.promos(id),
  ADD COLUMN IF NOT EXISTS promo_name text;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promos_super_admin" ON public.promos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users
                 WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users
                 WHERE id = auth.uid() AND role = 'super_admin'));
