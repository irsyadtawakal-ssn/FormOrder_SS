// Salin file ini ke config.js dan isi dengan kredensial Supabase kamu.
// JANGAN commit config.js ke git (sudah ada di .gitignore).
//
// Cara mendapatkan nilai ini:
//   Supabase Dashboard → Settings → API
//   - Project URL  → supabaseUrl
//   - anon / public key → supabaseAnonKey
//
// CATATAN KEAMANAN:
//   - anon key AMAN di-expose ke frontend (Supabase mendesain ini untuk public)
//   - Yang TIDAK boleh di frontend: service_role key
//   - Semua akses diproteksi RLS di database

window.SUKA_CONFIG = {
  supabaseUrl:     'https://xxxxxxxxxxxxxxxxxxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};
