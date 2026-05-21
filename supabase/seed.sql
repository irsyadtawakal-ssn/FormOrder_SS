-- SUKA Shawarma — Seed data (development & testing)
-- Jalankan setelah semua migrations

-- ─── categories ───────────────────────────────────────────────────────────────
INSERT INTO categories (id, name, sort_order) VALUES
  ('cat-0001-0000-0000-000000000001', 'Makanan',  1),
  ('cat-0001-0000-0000-000000000002', 'Minuman',  2),
  ('cat-0001-0000-0000-000000000003', 'Paket Hemat', 3)
ON CONFLICT (id) DO NOTHING;

-- ─── 1 outlet sample ──────────────────────────────────────────────────────────
INSERT INTO outlets (id, slug, name, address, lat, lng, phone_wa, type, open_hour, close_hour) VALUES
  (
    'out-0001-0000-0000-000000000001',
    'cimanggu',
    'SUKA Shawarma Cimanggu',
    'Jl. Cimanggu Permai No.12, Tanah Sareal, Bogor, Jawa Barat',
    -6.5671, 106.7837,
    '6281234567001',
    'owned',
    '10:00', '22:00'
  ),
  (
    'out-0001-0000-0000-000000000002',
    'tajur',
    'SUKA Shawarma Tajur',
    'Jl. Raya Tajur No.50, Bogor Timur, Bogor, Jawa Barat',
    -6.6012, 106.8345,
    '6281234567002',
    'partner',
    '09:00', '21:00'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── menu items ───────────────────────────────────────────────────────────────
INSERT INTO menu_items (id, category_id, name, description, base_price, is_best_seller, sort_order) VALUES
  (
    'mi-00001-000-0000-000000000001',
    'cat-0001-0000-0000-000000000001',
    'Shawarma Original',
    'Wrap shawarma dengan pilihan isi ayam atau sapi, sayuran segar, dan saus spesial khas SUKA.',
    25000, true, 1
  ),
  (
    'mi-00001-000-0000-000000000002',
    'cat-0001-0000-0000-000000000001',
    'Shawarma Jumbo',
    'Porsi extra besar dari Shawarma Original. Cocok untuk yang benar-benar lapar.',
    38000, false, 2
  ),
  (
    'mi-00001-000-0000-000000000003',
    'cat-0001-0000-0000-000000000001',
    'Kentang Goreng',
    'Kentang goreng renyah, disajikan dengan saus pilihan.',
    12000, false, 3
  ),
  (
    'mi-00001-000-0000-000000000004',
    'cat-0001-0000-0000-000000000002',
    'Es Teh Manis',
    'Teh manis dingin segar. Cocok menemani shawarma.',
    8000, false, 1
  ),
  (
    'mi-00001-000-0000-000000000005',
    'cat-0001-0000-0000-000000000002',
    'Es Jeruk',
    'Jeruk peras segar dengan es batu.',
    12000, false, 2
  ),
  (
    'mi-00001-000-0000-000000000006',
    'cat-0001-0000-0000-000000000002',
    'Air Mineral',
    'Botol 600ml.',
    5000, false, 3
  ),
  (
    'mi-00001-000-0000-000000000007',
    'cat-0001-0000-0000-000000000003',
    'Combo Duo',
    '2 Shawarma Original + 2 Es Teh Manis. Hemat lebih.',
    55000, true, 1
  )
ON CONFLICT (id) DO NOTHING;

-- ─── menu_variants ────────────────────────────────────────────────────────────

-- Shawarma Original
INSERT INTO menu_variants (id, menu_item_id, label, is_required, is_multi, sort_order) VALUES
  ('mv-0001-000-0000-000000000001', 'mi-00001-000-0000-000000000001', 'Pilih Isi',    true,  false, 1),
  ('mv-0001-000-0000-000000000002', 'mi-00001-000-0000-000000000001', 'Level Pedas',  true,  false, 2),
  ('mv-0001-000-0000-000000000003', 'mi-00001-000-0000-000000000001', 'Add-on',       false, true,  3)
ON CONFLICT (id) DO NOTHING;

-- Shawarma Jumbo
INSERT INTO menu_variants (id, menu_item_id, label, is_required, is_multi, sort_order) VALUES
  ('mv-0001-000-0000-000000000004', 'mi-00001-000-0000-000000000002', 'Pilih Isi',    true,  false, 1),
  ('mv-0001-000-0000-000000000005', 'mi-00001-000-0000-000000000002', 'Level Pedas',  true,  false, 2),
  ('mv-0001-000-0000-000000000006', 'mi-00001-000-0000-000000000002', 'Add-on',       false, true,  3)
ON CONFLICT (id) DO NOTHING;

-- Kentang Goreng
INSERT INTO menu_variants (id, menu_item_id, label, is_required, is_multi, sort_order) VALUES
  ('mv-0001-000-0000-000000000007', 'mi-00001-000-0000-000000000003', 'Saus',         true,  false, 1)
ON CONFLICT (id) DO NOTHING;

-- Es Teh Manis
INSERT INTO menu_variants (id, menu_item_id, label, is_required, is_multi, sort_order) VALUES
  ('mv-0001-000-0000-000000000008', 'mi-00001-000-0000-000000000004', 'Gula',         true,  false, 1)
ON CONFLICT (id) DO NOTHING;

-- ─── menu_variant_options ─────────────────────────────────────────────────────

-- Pilih Isi (Shawarma Original)
INSERT INTO menu_variant_options (variant_id, name, price_modifier, is_default, sort_order) VALUES
  ('mv-0001-000-0000-000000000001', 'Ayam',             0,    true,  1),
  ('mv-0001-000-0000-000000000001', 'Sapi',             5000, false, 2),
  ('mv-0001-000-0000-000000000001', 'Mix Ayam + Sapi',  8000, false, 3);

-- Level Pedas (Shawarma Original)
INSERT INTO menu_variant_options (variant_id, name, price_modifier, is_default, sort_order) VALUES
  ('mv-0001-000-0000-000000000002', 'Tidak Pedas', 0, true,  1),
  ('mv-0001-000-0000-000000000002', 'Sedang',      0, false, 2),
  ('mv-0001-000-0000-000000000002', 'Pedas 🔥',    0, false, 3);

-- Add-on (Shawarma Original)
INSERT INTO menu_variant_options (variant_id, name, price_modifier, is_default, sort_order) VALUES
  ('mv-0001-000-0000-000000000003', 'Extra Saus',   2000, false, 1),
  ('mv-0001-000-0000-000000000003', 'Extra Keju',   5000, false, 2),
  ('mv-0001-000-0000-000000000003', 'Extra Daging', 8000, false, 3);

-- Pilih Isi (Shawarma Jumbo)
INSERT INTO menu_variant_options (variant_id, name, price_modifier, is_default, sort_order) VALUES
  ('mv-0001-000-0000-000000000004', 'Ayam',            0,    true,  1),
  ('mv-0001-000-0000-000000000004', 'Sapi',            5000, false, 2),
  ('mv-0001-000-0000-000000000004', 'Mix Ayam + Sapi', 8000, false, 3);

-- Level Pedas (Shawarma Jumbo)
INSERT INTO menu_variant_options (variant_id, name, price_modifier, is_default, sort_order) VALUES
  ('mv-0001-000-0000-000000000005', 'Tidak Pedas', 0, true,  1),
  ('mv-0001-000-0000-000000000005', 'Sedang',      0, false, 2),
  ('mv-0001-000-0000-000000000005', 'Pedas 🔥',    0, false, 3);

-- Add-on (Shawarma Jumbo)
INSERT INTO menu_variant_options (variant_id, name, price_modifier, is_default, sort_order) VALUES
  ('mv-0001-000-0000-000000000006', 'Extra Saus',   2000, false, 1),
  ('mv-0001-000-0000-000000000006', 'Extra Keju',   5000, false, 2),
  ('mv-0001-000-0000-000000000006', 'Extra Daging', 8000, false, 3);

-- Saus (Kentang)
INSERT INTO menu_variant_options (variant_id, name, price_modifier, is_default, sort_order) VALUES
  ('mv-0001-000-0000-000000000007', 'Saus Mayo', 0,    true,  1),
  ('mv-0001-000-0000-000000000007', 'BBQ',       1000, false, 2),
  ('mv-0001-000-0000-000000000007', 'Cheese',    2000, false, 3);

-- Gula (Es Teh)
INSERT INTO menu_variant_options (variant_id, name, price_modifier, is_default, sort_order) VALUES
  ('mv-0001-000-0000-000000000008', 'Normal',     0, true,  1),
  ('mv-0001-000-0000-000000000008', 'Less Sugar', 0, false, 2),
  ('mv-0001-000-0000-000000000008', 'No Sugar',   0, false, 3);
