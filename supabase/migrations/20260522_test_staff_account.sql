-- Daftarkan akun staff outlet test ke tabel admin_users
-- Ikuti pola yang sama dengan 19 outlet lainnya
-- Email: ss.test@shawarma.com / Password: ss1234

INSERT INTO public.admin_users (id, email, full_name, role, outlet_id, is_active)
SELECT
  au.id,
  au.email,
  'SS Test',
  'outlet_staff',
  o.id,
  true
FROM auth.users au
JOIN public.outlets o ON o.name ILIKE '%test%'
WHERE au.email = 'ss.test@shawarma.com'
ON CONFLICT (id) DO UPDATE
  SET full_name  = EXCLUDED.full_name,
      role       = EXCLUDED.role,
      outlet_id  = EXCLUDED.outlet_id,
      is_active  = EXCLUDED.is_active;

-- Verifikasi
SELECT au.email, am.full_name, am.role, o.name AS outlet
FROM public.admin_users am
JOIN auth.users au ON au.id = am.id
JOIN public.outlets o ON o.id = am.outlet_id
WHERE au.email = 'ss.test@shawarma.com';
