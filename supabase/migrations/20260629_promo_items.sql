-- supabase/migrations/20260629_promo_items.sql
-- Add item_ids to promos table for per-menu promo feature

ALTER TABLE public.promos
  ADD COLUMN IF NOT EXISTS item_ids uuid[];
