-- Migration: update phone_wa untuk 17 outlet
-- Jalankan di Supabase SQL Editor

UPDATE outlets SET phone_wa = '6285283873778' WHERE slug = 'kitchen';
UPDATE outlets SET phone_wa = '625282927495'  WHERE slug = 'empang';
UPDATE outlets SET phone_wa = '6285282937817' WHERE slug = 'paledang';
UPDATE outlets SET phone_wa = '6285282937655' WHERE slug = 'cimanggu';
UPDATE outlets SET phone_wa = '6281235273768' WHERE slug = 'depok-sukmajaya';
UPDATE outlets SET phone_wa = '6281228737911' WHERE slug = 'jagakarsa';
UPDATE outlets SET phone_wa = '6282128230591' WHERE slug = 'beji';
UPDATE outlets SET phone_wa = '6282189326985' WHERE slug = 'sawangan';
UPDATE outlets SET phone_wa = '6282189326968' WHERE slug = 'pajajaran';
UPDATE outlets SET phone_wa = '628138321263'  WHERE slug = 'dramaga';
UPDATE outlets SET phone_wa = '6282315458256' WHERE slug = 'cibinong';
UPDATE outlets SET phone_wa = '6282315471969' WHERE slug = 'citayam';
UPDATE outlets SET phone_wa = '6282299329669' WHERE slug = 'tebet';
UPDATE outlets SET phone_wa = '6282299287928' WHERE slug = 'cirendeu';
UPDATE outlets SET phone_wa = '6282299325627' WHERE slug = 'pekayon';
UPDATE outlets SET phone_wa = '6281226787768' WHERE slug = 'jatiwaringin';
UPDATE outlets SET phone_wa = '6285285409462' WHERE slug = 'kalisari';

-- Verifikasi hasil
SELECT slug, name, phone_wa FROM outlets ORDER BY name;
