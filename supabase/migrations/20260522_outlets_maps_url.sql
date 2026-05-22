-- Migration: tambah kolom maps_url ke tabel outlets + isi data
-- Jalankan di Supabase SQL Editor

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS maps_url TEXT;

-- Update maps URL per outlet
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/1Mo7Ma6v6McAfCyZ7' WHERE slug = 'kitchen';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/3XX1dMon2aFqEc7z9' WHERE slug = 'empang';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/y5PX3PMcCxz3peoV6' WHERE slug = 'paledang';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/keHGRtwSNcaMNbNn8' WHERE slug = 'cimanggu';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/TJDyhiBLPMU9GrXf9' WHERE slug = 'depok-sukmajaya';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/niCbBChrqKDkxL1c8' WHERE slug = 'beji';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/bNUFQSYr1DsPasMP9' WHERE slug = 'sawangan';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/vsujPCoa77Rg77VG6' WHERE slug = 'jagakarsa';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/kjdhXWBJB4F3p1378' WHERE slug = 'dramaga';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/RSZCK4CKHyvji4uK8' WHERE slug = 'cibinong';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/mbyPhdKZMzimTDn8A' WHERE slug = 'citayam';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/Kt7gvW9nDtCFmWwdA' WHERE slug = 'tebet';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/fvzb4QR7Hmfi2ki46' WHERE slug = 'cirendeu';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/4Unngc9S6GWbc57q6' WHERE slug = 'pekayon';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/MpwxJhouK4DEjZk16' WHERE slug = 'jatiwaringin';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/Hi6rPCD9eYZxEEsa8' WHERE slug = 'kalisari';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/SGPd9WkLhBHtJXP86' WHERE slug = 'ciseeng';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/wE1hrhFgXVqrqeBs8' WHERE slug = 'jatiasih';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/u5qzaaXNyFDCw83L9' WHERE slug = 'pajajaran';
UPDATE outlets SET maps_url = 'https://maps.app.goo.gl/N6jT7dVe5Jb87fCK7' WHERE slug = 'blok-m';

-- Tambah city untuk Blok M (Jakarta) jika belum ada
UPDATE outlets SET city = 'Jakarta' WHERE slug = 'blok-m' AND (city IS NULL OR city = '');

-- Cek hasil:
-- SELECT slug, name, city, maps_url FROM outlets ORDER BY city, name;
