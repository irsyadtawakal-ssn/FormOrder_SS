-- SUKA Shawarma — Row Level Security policies
-- Jalankan setelah 001_schema.sql

-- Aktifkan RLS di semua tabel
ALTER TABLE outlets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_variants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_variant_options  ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_menu_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings          ENABLE ROW LEVEL SECURITY;

-- ─── helper functions ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM admin_users WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_outlet_id()
RETURNS uuid AS $$
  SELECT outlet_id FROM admin_users WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── outlets ──────────────────────────────────────────────────────────────────
-- Semua orang bisa lihat outlet (customer perlu ini untuk home page)
CREATE POLICY "outlets_public_select"  ON outlets FOR SELECT USING (true);
CREATE POLICY "outlets_admin_all"      ON outlets FOR ALL    TO authenticated USING (get_my_role() = 'super_admin');

-- ─── categories ───────────────────────────────────────────────────────────────
CREATE POLICY "categories_public_select" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "categories_auth_select"   ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_admin_all"     ON categories FOR ALL    TO authenticated USING (get_my_role() = 'super_admin');

-- ─── menu_items ───────────────────────────────────────────────────────────────
CREATE POLICY "menu_items_public_select" ON menu_items FOR SELECT USING (is_active = true);
CREATE POLICY "menu_items_auth_select"   ON menu_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "menu_items_admin_all"     ON menu_items FOR ALL    TO authenticated USING (get_my_role() = 'super_admin');

-- ─── menu_variants ────────────────────────────────────────────────────────────
CREATE POLICY "menu_variants_public_select" ON menu_variants FOR SELECT USING (true);
CREATE POLICY "menu_variants_admin_all"     ON menu_variants FOR ALL    TO authenticated USING (get_my_role() = 'super_admin');

-- ─── menu_variant_options ─────────────────────────────────────────────────────
CREATE POLICY "menu_var_opts_public_select" ON menu_variant_options FOR SELECT USING (true);
CREATE POLICY "menu_var_opts_admin_all"     ON menu_variant_options FOR ALL    TO authenticated USING (get_my_role() = 'super_admin');

-- ─── outlet_menu_overrides ────────────────────────────────────────────────────
CREATE POLICY "overrides_public_select"  ON outlet_menu_overrides FOR SELECT USING (true);
CREATE POLICY "overrides_staff_write"    ON outlet_menu_overrides FOR ALL    TO authenticated USING (
  outlet_id = get_my_outlet_id() OR get_my_role() = 'super_admin'
);

-- ─── orders ───────────────────────────────────────────────────────────────────
-- Customer hanya bisa lihat by order_number — query via fungsi get_order_by_number()
-- INSERT/UPDATE hanya via Edge Function (service role), bukan dari frontend langsung
CREATE POLICY "orders_public_select"  ON orders FOR SELECT USING (true);
CREATE POLICY "orders_staff_select"   ON orders FOR SELECT TO authenticated USING (
  outlet_id = get_my_outlet_id() OR get_my_role() = 'super_admin'
);
CREATE POLICY "orders_staff_update"   ON orders FOR UPDATE TO authenticated USING (
  outlet_id = get_my_outlet_id() OR get_my_role() = 'super_admin'
);
CREATE POLICY "orders_admin_all"      ON orders FOR ALL    TO authenticated USING (get_my_role() = 'super_admin');

-- ─── order_items ──────────────────────────────────────────────────────────────
CREATE POLICY "order_items_public_select" ON order_items FOR SELECT USING (true);
CREATE POLICY "order_items_staff_select"  ON order_items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_id
      AND (o.outlet_id = get_my_outlet_id() OR get_my_role() = 'super_admin')
  )
);

-- ─── admin_users ──────────────────────────────────────────────────────────────
-- Staff hanya lihat row sendiri; super_admin lihat & kelola semua
CREATE POLICY "admin_users_self_select"  ON admin_users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "admin_users_admin_all"    ON admin_users FOR ALL    TO authenticated USING (get_my_role() = 'super_admin');

-- ─── notification_logs ────────────────────────────────────────────────────────
CREATE POLICY "notif_logs_staff_select" ON notification_logs FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_id
      AND (o.outlet_id = get_my_outlet_id() OR get_my_role() = 'super_admin')
  )
);
CREATE POLICY "notif_logs_admin_all" ON notification_logs FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

-- ─── notification_templates ───────────────────────────────────────────────────
CREATE POLICY "notif_tmpl_auth_select" ON notification_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "notif_tmpl_admin_all"   ON notification_templates FOR ALL    TO authenticated USING (get_my_role() = 'super_admin');

-- ─── app_settings ─────────────────────────────────────────────────────────────
-- Hanya key publik yang boleh dibaca anonymous (untuk service_fee_percent dll)
CREATE POLICY "app_settings_public_select" ON app_settings FOR SELECT USING (
  key IN ('service_fee_percent', 'qris_expire_minutes', 'service_fee_passthrough')
);
CREATE POLICY "app_settings_auth_select"   ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_admin_all"     ON app_settings FOR ALL    TO authenticated USING (get_my_role() = 'super_admin');
