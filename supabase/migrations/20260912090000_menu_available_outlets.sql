-- Migration: batasi tayang menu per outlet di Order-Online
--
-- Admin-dashboard sudah menyimpan pembatasan outlet di menu_items.available_outlets,
-- tetapi kolom itu tidak pernah ikut tersinkron ke sini, sehingga katalog Order-Online
-- menampilkan SEMUA menu aktif di setiap outlet.
--
-- NULL / array kosong = tayang di semua outlet (perilaku lama, aman untuk data existing).
-- Isi array = hanya tayang di outlet tersebut.
--
-- Isi array memakai ID outlet milik admin-dashboard (bukan outlets.id di DB ini),
-- jadi frontend mencocokkannya ke outlets.pos_outlet_id (dengan fallback outlets.id
-- untuk outlet baru yang dibuat dengan ID kembar di kedua database).

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS available_outlets uuid[];

COMMENT ON COLUMN menu_items.available_outlets IS
  'ID outlet admin-dashboard (cocokkan ke outlets.pos_outlet_id). NULL/kosong = tayang di semua outlet.';

-- Backfill menu yang sudah dibatasi di admin-dashboard supaya tidak perlu simpan ulang manual.
UPDATE menu_items SET available_outlets = ARRAY['550e8400-e29b-41d4-a716-446655440005']::uuid[]
  WHERE id = '169a0768-c286-444e-9a5f-b8816e27e24f';  -- PAKET SKS -> Depok Sukmajaya
UPDATE menu_items SET available_outlets = ARRAY['550e8400-e29b-41d4-a716-446655440007']::uuid[]
  WHERE id = 'd666a005-556d-4dbe-9aca-c5a592ef5db2';  -- MBG -> Beji
UPDATE menu_items SET available_outlets = ARRAY['3f38c41d-11e3-49ce-a189-d7303e45f9ad']::uuid[]
  WHERE id = '0a253757-834c-4fac-be45-895abd38336e';  -- Family Bundling -> Cibubur
