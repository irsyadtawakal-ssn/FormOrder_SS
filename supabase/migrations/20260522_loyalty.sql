-- supabase/migrations/20260522_loyalty.sql
-- Tabel customers + vouchers untuk program loyalty SUKA Shawarma

-- ── Tabel customers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_number      text UNIQUE NOT NULL,
  name           text NOT NULL,
  total_orders   integer NOT NULL DEFAULT 0,
  total_spent    bigint  NOT NULL DEFAULT 0,
  first_order_at timestamptz,
  last_order_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Tabel vouchers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vouchers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text UNIQUE NOT NULL,
  customer_wa       text NOT NULL REFERENCES public.customers(wa_number),
  milestone         integer NOT NULL,
  reward_desc       text NOT NULL,
  is_used           boolean NOT NULL DEFAULT false,
  used_at           timestamptz,
  used_by_outlet_id uuid REFERENCES public.outlets(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers  ENABLE ROW LEVEL SECURITY;

-- super_admin: full access customers
CREATE POLICY "customers_super_admin" ON public.customers
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- super_admin: full access vouchers
CREATE POLICY "vouchers_super_admin" ON public.vouchers
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- outlet_staff: bisa baca voucher (untuk verifikasi di kasir)
CREATE POLICY "vouchers_staff_read" ON public.vouchers
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND is_active = true)
  );

-- outlet_staff: bisa mark voucher as used
CREATE POLICY "vouchers_staff_update" ON public.vouchers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND is_active = true)
  )
  WITH CHECK (is_used = true);

-- ── app_settings defaults ─────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value) VALUES
  ('loyalty_enabled',     'false'),
  ('loyalty_notif_auto',  'false'),
  ('loyalty_milestone_1', '5'),
  ('loyalty_reward_1',    '"Diskon 10% untuk order berikutnya"'),
  ('loyalty_milestone_2', '10'),
  ('loyalty_reward_2',    '"Free 1 item Original Sapi Sedang"'),
  ('loyalty_milestone_3', '20'),
  ('loyalty_reward_3',    '"Free 1 Shawarma ukuran apa saja"')
ON CONFLICT (key) DO NOTHING;

-- ── Verifikasi ────────────────────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('customers','vouchers');
-- SELECT key FROM app_settings WHERE key LIKE 'loyalty%';
