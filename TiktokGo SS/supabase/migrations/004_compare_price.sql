-- Migration 004: tambah compare_price ke menu_items
-- Jalankan di Supabase Dashboard → SQL Editor

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS compare_price integer DEFAULT NULL;

-- compare_price = harga coret / harga asli sebelum diskon
-- NULL = tidak ada diskon
-- Contoh: base_price=40000, compare_price=50000 → diskon 20%
