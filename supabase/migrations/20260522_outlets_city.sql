-- Migration: tambah kolom city ke tabel outlets
-- Jalankan di Supabase SQL Editor

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS city TEXT;

-- Isi data kota berdasarkan slug
UPDATE outlets SET city = 'Bogor'   WHERE slug IN ('kitchen','empang','paledang','cimanggu','pajajaran','dramaga','cibinong');
UPDATE outlets SET city = 'Depok'   WHERE slug IN ('depok-sukmajaya','beji','sawangan','citayam');
UPDATE outlets SET city = 'Jakarta' WHERE slug IN ('jagakarsa','tebet','cirendeu','kalisari','pekayon','jatiwaringin');

-- Cek hasil:
-- SELECT slug, name, city FROM outlets ORDER BY city, name;
