# Gunakan image web server Nginx yang sangat ringan
FROM nginx:alpine

# Copy semua file dari direktori saat ini ke direktori publik Nginx
COPY . /usr/share/nginx/html

# Expose port 80
EXPOSE 80
