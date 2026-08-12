// Supabase client singleton — dipakai semua halaman
// Dimuat setelah: supabase CDN script + config.js

(function () {


  if (!window.supabase || !window.supabase.createClient) {
    console.error('[SUKA] Supabase CDN belum dimuat! Pastikan script supabase CDN ada sebelum supabase.js');
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#fef2f2;color:#dc2626;padding:16px;text-align:center;font-weight:bold;border-bottom:2px solid #fca5a5">⚠️ Supabase library gagal dimuat — periksa koneksi internet</div>');
    return;
  }

  try {
    const { createClient } = window.supabase;

    const supabaseUrl = 'https://qntuhtkujpwudcpudwbj.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudHVodGt1anB3dWRjcHVkd2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTMyNjcsImV4cCI6MjA5NDgyOTI2N30.X2pjS2ont0ekVVc71HLacM2I49aLeypLRRgoPQV6OTw';

    window.db = createClient(
      supabaseUrl,
      supabaseAnonKey,
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
