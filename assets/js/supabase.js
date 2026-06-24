// Supabase client singleton — dipakai semua halaman
// Dimuat setelah: supabase CDN script + config.js

(function () {
  if (!window.SUKA_CONFIG) {
    console.error('[SUKA] config.js tidak ditemukan. Salin config.example.js ke config.js dan isi kredensial.');
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#fef2f2;color:#dc2626;padding:16px;text-align:center;font-weight:bold;border-bottom:2px solid #fca5a5">⚠️ config.js tidak ditemukan</div>');
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[SUKA] Supabase CDN belum dimuat! Pastikan script supabase CDN ada sebelum supabase.js');
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#fef2f2;color:#dc2626;padding:16px;text-align:center;font-weight:bold;border-bottom:2px solid #fca5a5">⚠️ Supabase library gagal dimuat — periksa koneksi internet</div>');
    return;
  }

  try {
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
    console.log('[SUKA] Supabase client initialized OK');
  } catch (err) {
    console.error('[SUKA] Supabase createClient gagal:', err);
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#fef2f2;color:#dc2626;padding:16px;text-align:center;font-weight:bold;border-bottom:2px solid #fca5a5">⚠️ Gagal inisialisasi Supabase: ' + err.message + '</div>');
  }
})();
