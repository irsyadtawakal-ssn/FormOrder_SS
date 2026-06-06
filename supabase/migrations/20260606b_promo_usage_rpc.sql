-- Fungsi atomik untuk increment usage_count promo
-- Menghindari race condition read-modify-write di Edge Functions
CREATE OR REPLACE FUNCTION increment_promo_usage(p_promo_id uuid)
RETURNS TABLE(usage_count integer, usage_limit integer)
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.promos
  SET usage_count = promos.usage_count + 1
  WHERE id = p_promo_id
  RETURNING promos.usage_count, promos.usage_limit;
$$;
