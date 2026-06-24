// pixel.js — Meta Pixel dinamis dari pengaturan admin (app_settings)
// PageView otomatis saat load; gunakan sukaPixelTrack() untuk event spesifik per halaman

window._sukaPixelQueue = [];

// Antrian event sebelum pixel siap
// options.eventID dipakai untuk deduplikasi dengan Conversions API (server-side)
window.sukaPixelTrack = function(event, params, options) {
  if (typeof fbq !== 'undefined') {
    fbq('track', event, params || {}, options || undefined);
  } else {
    window._sukaPixelQueue.push({ event: event, params: params || {}, options: options || undefined });
  }
};

(async function initPixel() {
  if (!window.db) {
    console.warn('[SUKA Pixel] window.db belum siap — pixel tidak diinisialisasi.');
    return;
  }

  const { data, error } = await window.db
    .from('app_settings')
    .select('key, value')
    .in('key', ['meta_pixel_id', 'meta_pixel_enabled']);

  if (error) {
    console.warn('[SUKA Pixel] Gagal baca app_settings (cek RLS app_settings_public_select):', error.message);
    return;
  }
  if (!data || data.length === 0) {
    console.warn('[SUKA Pixel] Setting pixel tidak terbaca. Pastikan meta_pixel_id & meta_pixel_enabled diizinkan di RLS public_select.');
    return;
  }

  var map = {};
  data.forEach(function(r) { map[r.key] = r.value; });

  if (map.meta_pixel_enabled !== 'true' || !map.meta_pixel_id) {
    console.info('[SUKA Pixel] Pixel nonaktif atau ID kosong (enabled=' + map.meta_pixel_enabled + ').');
    return;
  }

  var pixelId = map.meta_pixel_id.trim();
  if (!pixelId) return;

  // Inject Meta Pixel base code
  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;
    n=f.fbq=function(){n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
    t=b.createElement(e);t.async=!0;t.src=v;
    s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

  fbq('init', pixelId);
  fbq('track', 'PageView');

  // Flush event yang sudah antri sebelum pixel siap
  (window._sukaPixelQueue || []).forEach(function(item) {
    fbq('track', item.event, item.params, item.options || undefined);
  });
  window._sukaPixelQueue = [];
})();
