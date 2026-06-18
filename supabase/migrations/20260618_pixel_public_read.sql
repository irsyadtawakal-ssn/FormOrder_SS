-- 20260618_pixel_public_read.sql
-- Fix: Meta Pixel tidak kebaca di sisi publik.
--
-- Penyebab: policy app_settings_public_select hanya mengizinkan anon membaca
-- service_fee_percent, qris_expire_minutes, service_fee_passthrough. Sementara
-- assets/js/pixel.js meng-query meta_pixel_id & meta_pixel_enabled, sehingga
-- RLS mem-filter baris tersebut → data kosong → pixel tidak pernah di-inject.
--
-- Solusi: tambahkan meta_pixel_id & meta_pixel_enabled ke allowlist publik.
-- CATATAN KEAMANAN: meta_pixel_token (access token Conversions API) SENGAJA
-- TIDAK dimasukkan — token itu rahasia dan hanya boleh dibaca server-side
-- (edge function pakai service_role), bukan oleh anon di frontend.

DROP POLICY IF EXISTS "app_settings_public_select" ON app_settings;

CREATE POLICY "app_settings_public_select" ON app_settings FOR SELECT USING (
  key IN (
    'service_fee_percent',
    'qris_expire_minutes',
    'service_fee_passthrough',
    'meta_pixel_id',
    'meta_pixel_enabled'
  )
);
