# Gunakan image web server Nginx yang sangat ringan
FROM nginx:alpine

# Copy semua file dari direktori saat ini ke direktori publik Nginx
COPY . /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Saat container berjalan, buat file config.js dari variabel environment (dari Coolify) lalu jalankan Nginx
CMD ["/bin/sh", "-c", "echo \"window.SUKA_CONFIG = { supabaseUrl: '${SUPABASE_URL}', supabaseAnonKey: '${SUPABASE_ANON_KEY}' };\" > /usr/share/nginx/html/config.js && nginx -g 'daemon off;'"]
