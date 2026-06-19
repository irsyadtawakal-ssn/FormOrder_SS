-- Integrasi Order Online -> POS Kasir
-- Pemetaan outlet order-system ke outlet pos-kasir (project Supabase berbeda),
-- supaya push-order-to-kasir tahu outlet_id tujuan di sisi pos-kasir.
-- Diisi manual sekali per outlet via admin panel / SQL setelah migration ini jalan.

ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS pos_outlet_id UUID;
