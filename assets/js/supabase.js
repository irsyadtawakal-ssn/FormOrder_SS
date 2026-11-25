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

    // Synchronize global brand identity across pages
    function applyGlobalBrand() {
      try {
        const brandName = localStorage.getItem('suka_brand_name');
        const brandLogo = localStorage.getItem('suka_brand_logo');
        if (brandName) {
          document.querySelectorAll('.topbar-logo span, .hero-header-brand, .brand-name-text').forEach(el => {
            el.textContent = brandName;
          });
        }
        document.querySelectorAll('.topbar-logo img, #heroLogoImg, .brand-logo-img').forEach(el => {
          if (!el.dataset.defaultSrc && el.getAttribute('src')) {
            el.dataset.defaultSrc = el.getAttribute('src');
          }
          if (brandLogo) {
            el.src = brandLogo;
            el.style.display = 'inline-block';
          } else if (el.dataset.defaultSrc) {
            el.src = el.dataset.defaultSrc;
            el.style.display = 'inline-block';
          }
        });
      } catch (e) {
        // ignore local storage errors
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyGlobalBrand);
    } else {
      applyGlobalBrand();
    }

    window.db
      .from('app_settings')
      .select('key, value')
      .in('key', ['brand_name', 'brand_logo', 'hero_logo_url'])
      .then(({ data }) => {
        if (data && data.length > 0) {
          const heroLogoRow = data.find(d => d.key === 'hero_logo_url');
          const brandLogoRow = data.find(d => d.key === 'brand_logo');
          const logo = heroLogoRow !== undefined ? heroLogoRow.value : brandLogoRow?.value;
          const name = data.find(d => d.key === 'brand_name')?.value;
          if (logo) {
            localStorage.setItem('suka_brand_logo', logo);
          } else if (heroLogoRow !== undefined || brandLogoRow !== undefined) {
            localStorage.removeItem('suka_brand_logo');
          }
          if (name) localStorage.setItem('suka_brand_name', name);
          applyGlobalBrand();
        }
      })
      .catch(() => {});
  } catch (err) {
    console.error('[SUKA] Supabase createClient gagal:', err);
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#fef2f2;color:#dc2626;padding:16px;text-align:center;font-weight:bold;border-bottom:2px solid #fca5a5">⚠️ Gagal inisialisasi Supabase: ' + err.message + '</div>');
  }
})();
