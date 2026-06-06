-- supabase/migrations/20260606c_customers_favorite.sql
-- Tambah kolom favorite_menu dan favorite_outlet_id ke tabel customers

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS favorite_menu      text,
  ADD COLUMN IF NOT EXISTS favorite_outlet_id uuid REFERENCES public.outlets(id);
