-- Daftarkan akun staff test ke tabel admin_users
-- Jalankan SETELAH buat user di Supabase Dashboard > Authentication > Users
-- Email: staff.test@sukashawarma.com / Password: Test1234!

INSERT INTO public.admin_users (id, email, full_name, role, outlet_id)
SELECT
  au.id,
  au.email,
  'Staff Test',
  'outlet_staff',
  o.id
FROM auth.users au
JOIN public.outlets o ON o.name ILIKE '%test%'
WHERE au.email = 'staff.test@sukashawarma.com'
ON CONFLICT (id) DO UPDATE
  SET full_name  = EXCLUDED.full_name,
      role       = EXCLUDED.role,
      outlet_id  = EXCLUDED.outlet_id;

-- Verifikasi
SELECT au.email, am.full_name, am.role, o.name AS outlet
FROM public.admin_users am
JOIN auth.users au ON au.id = am.id
JOIN public.outlets o ON o.id = am.outlet_id
WHERE au.email = 'staff.test@sukashawarma.com';
