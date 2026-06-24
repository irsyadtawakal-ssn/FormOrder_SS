-- 20260623_hero_public_read.sql
-- Fix: Banner (dan logo) tidak muncul di HALAMAN CUSTOMER.
--
-- Penyebab: policy app_settings_public_select hanya mengizinkan anon membaca
-- service_fee_percent, qris_expire_minutes, service_fee_passthrough,
-- meta_pixel_id, meta_pixel_enabled. Sementara index.html (customer, anonim)
-- meng-query hero_banner_url & hero_logo_url → RLS mem-filter baris tersebut →
-- data kosong → src banner jatuh ke file fallback statis yang sudah 404 →
-- banner hilang.
--
-- Solusi: tambahkan hero_banner_url & hero_logo_url ke allowlist publik.
-- CATATAN KEAMANAN: meta_pixel_token TETAP dikecualikan (rahasia, server-side).

DROP POLICY IF EXISTS "app_settings_public_select" ON app_settings;

CREATE POLICY "app_settings_public_select" ON app_settings FOR SELECT USING (
  key IN (
    'service_fee_percent',
    'qris_expire_minutes',
    'service_fee_passthrough',
    'meta_pixel_id',
    'meta_pixel_enabled',
    'hero_banner_url',
    'hero_logo_url'
  )
);
