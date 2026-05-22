-- Daftarkan akun test ke tabel admin_users sebagai super_admin
-- Jalankan SETELAH buat user di Supabase Dashboard > Authentication > Users
-- Email: test@sukashawarma.com / Password: Test1234!

INSERT INTO public.admin_users (id, email, full_name, role, outlet_id)
SELECT
  au.id,
  au.email,
  'Akun Test',
  'super_admin',
  NULL
FROM auth.users au
WHERE au.email = 'test@sukashawarma.com'
ON CONFLICT (id) DO UPDATE
  SET full_name  = EXCLUDED.full_name,
      role       = EXCLUDED.role,
      outlet_id  = EXCLUDED.outlet_id;

-- Verifikasi
SELECT au.email, am.full_name, am.role
FROM public.admin_users am
JOIN auth.users au ON au.id = am.id
WHERE au.email = 'test@sukashawarma.com';
