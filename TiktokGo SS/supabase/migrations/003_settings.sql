-- SUKA Shawarma — Default app settings & storage buckets
-- Jalankan setelah 002_rls.sql

-- ─── app_settings defaults ────────────────────────────────────────────────────
INSERT INTO app_settings (key, value) VALUES
  ('service_fee_percent',    '0.7'),
  ('qris_expire_minutes',    '15'),
  ('service_fee_passthrough','true'),
  ('admin_central_wa',       '"08xxxxxxxxxx"')
ON CONFLICT (key) DO NOTHING;

-- ─── notification_templates ───────────────────────────────────────────────────
INSERT INTO notification_templates (key, body_template) VALUES
  ('new_order_admin',
   '🆕 ORDER BARU MASUK

#{{order_number}}
📍 Outlet: {{outlet_name}}
👤 {{customer_name}} ({{customer_wa}})
⏰ Ambil: {{pickup_time}}

🍽 Pesanan:
{{items_list}}

💰 Total: {{total}}

Detail: {{admin_link}}'),

  ('new_order_outlet',
   '🆕 ORDER BARU - PERLU DISIAPKAN

#{{order_number}}
👤 {{customer_name}} ({{customer_wa}})
⏰ Ambil: {{pickup_time}}

🍽 Pesanan:
{{items_list}}

💰 Total: {{total}} (sudah dibayar)

Buka admin panel untuk update status.'),

  ('paid_customer',
   '✅ Pembayaran Berhasil!

Hi {{customer_name}}, terima kasih ya 🙏

Pesanan #{{order_number}} sudah kami terima dan akan disiapkan.

📍 Ambil di:
{{outlet_name}}
{{outlet_address}}
🗺 Maps: {{outlet_maps_url}}

⏰ Estimasi siap: {{pickup_time}}
💰 Total bayar: {{total}}

Cek status: {{status_url}}

Sampai jumpa di outlet! 🌯'),

  ('ready_customer',
   '🎉 Pesanan SIAP Diambil!

Hi {{customer_name}}, pesananmu #{{order_number}} sudah siap.

Silakan datang ke:
📍 {{outlet_name}}

Tunjukkan order number ini ke kasir.

Selamat menikmati! 🌯'),

  ('cancelled_customer',
   'Maaf {{customer_name}},

Pesanan #{{order_number}} dibatalkan karena: {{reason}}.

Refund akan diproses dalam 1-3 hari kerja ke metode pembayaran yang sama.

Hubungi kami jika ada pertanyaan: {{admin_wa}}')

ON CONFLICT (key) DO NOTHING;

-- ─── storage buckets ──────────────────────────────────────────────────────────
-- Buat via Supabase dashboard: Storage → New bucket
-- Atau via CLI: supabase storage create-bucket menu-photos --public
--
-- Bucket: menu-photos  → public read, admin write
-- Bucket: logos        → public read, super_admin write
-- Bucket: csv-imports  → private, super_admin only
