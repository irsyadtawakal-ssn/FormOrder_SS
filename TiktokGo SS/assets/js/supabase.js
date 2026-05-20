// Supabase client singleton — dipakai semua halaman
// Dimuat setelah: supabase CDN script + config.js

(function () {
  if (!window.SUKA_CONFIG) {
    console.error('[SUKA] config.js tidak ditemukan. Salin config.example.js ke config.js dan isi kredensial.');
    return;
  }

  const { createClient } = window.supabase;

  window.db = createClient(
    window.SUKA_CONFIG.supabaseUrl,
    window.SUKA_CONFIG.supabaseAnonKey,
    {
      auth: {
        persistSession:   true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: { eventsPerSecond: 10 }
      }
    }
  );
})();
