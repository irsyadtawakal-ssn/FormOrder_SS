-- SUKA Shawarma — Schema init
-- Jalankan di Supabase SQL editor atau via: supabase db push

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── outlets ──────────────────────────────────────────────────────────────────
CREATE TABLE outlets (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  address     text NOT NULL,
  lat         numeric,
  lng         numeric,
  phone_wa    text,
  type        text NOT NULL CHECK (type IN ('owned','partner')),
  open_hour   time,
  close_hour  time,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── categories ───────────────────────────────────────────────────────────────
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true
);

-- ─── menu_items (master menu) ─────────────────────────────────────────────────
CREATE TABLE menu_items (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id    uuid REFERENCES categories(id) ON DELETE SET NULL,
  name           text NOT NULL,
  description    text,
  photo_url      text,
  base_price     numeric NOT NULL CHECK (base_price >= 0),
  is_best_seller boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0
);

-- ─── menu_variants (grup pilihan dalam satu menu item) ────────────────────────
CREATE TABLE menu_variants (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  label        text NOT NULL,
  is_required  boolean NOT NULL DEFAULT false,
  is_multi     boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0
);

-- ─── menu_variant_options ─────────────────────────────────────────────────────
CREATE TABLE menu_variant_options (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id     uuid NOT NULL REFERENCES menu_variants(id) ON DELETE CASCADE,
  name           text NOT NULL,
  price_modifier numeric NOT NULL DEFAULT 0,
  is_default     boolean NOT NULL DEFAULT false,
  sort_order     integer NOT NULL DEFAULT 0
);

-- ─── outlet_menu_overrides ────────────────────────────────────────────────────
-- Tidak ada row = pakai base_price dan is_available = true (default)
CREATE TABLE outlet_menu_overrides (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id      uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  menu_item_id   uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  price_override numeric CHECK (price_override >= 0),
  is_available   boolean NOT NULL DEFAULT true,
  UNIQUE (outlet_id, menu_item_id)
);

-- ─── orders ───────────────────────────────────────────────────────────────────
CREATE SEQUENCE order_number_seq;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text AS $$
DECLARE
  seq_val  integer;
  date_str text;
BEGIN
  seq_val  := nextval('order_number_seq');
  date_str := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD');
  RETURN 'ORD-' || date_str || '-' || lpad(seq_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE orders (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number        text UNIQUE NOT NULL DEFAULT generate_order_number(),
  outlet_id           uuid NOT NULL REFERENCES outlets(id),
  customer_name       text NOT NULL,
  customer_wa         text NOT NULL,
  pickup_time         text NOT NULL,
  notes               text,
  subtotal            numeric NOT NULL CHECK (subtotal >= 0),
  service_fee         numeric NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  total               numeric NOT NULL CHECK (total >= 0),
  status              text NOT NULL DEFAULT 'pending_payment' CHECK (
                        status IN ('pending_payment','paid','preparing','ready','done','cancelled','expired')
                      ),
  payment_method      text NOT NULL DEFAULT 'tripay_qris',
  tripay_reference    text,
  tripay_merchant_ref text NOT NULL,
  tripay_pay_url      text,
  qris_url            text,
  expires_at          timestamptz NOT NULL,
  paid_at             timestamptz,
  ready_at            timestamptz,
  done_at             timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── order_items (snapshot saat order dibuat) ─────────────────────────────────
-- Snapshot agar history tidak berubah saat master menu diubah
CREATE TABLE order_items (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name    text NOT NULL,
  selections   jsonb NOT NULL DEFAULT '{}',
  unit_price   numeric NOT NULL CHECK (unit_price >= 0),
  quantity     integer NOT NULL CHECK (quantity > 0),
  subtotal     numeric NOT NULL CHECK (subtotal >= 0),
  note         text
);

-- ─── admin_users ──────────────────────────────────────────────────────────────
CREATE TABLE admin_users (
  id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     text NOT NULL,
  full_name text NOT NULL,
  role      text NOT NULL CHECK (role IN ('super_admin','outlet_staff')),
  outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true
);

-- ─── notification_logs ────────────────────────────────────────────────────────
CREATE TABLE notification_logs (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  recipient_type text NOT NULL CHECK (recipient_type IN ('admin','outlet','customer')),
  recipient_phone text NOT NULL,
  message        text NOT NULL,
  status         text NOT NULL CHECK (status IN ('sent','failed')),
  provider       text NOT NULL DEFAULT 'fonnte',
  sent_at        timestamptz NOT NULL DEFAULT now(),
  error          jsonb
);

-- ─── notification_templates ───────────────────────────────────────────────────
CREATE TABLE notification_templates (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key           text UNIQUE NOT NULL,
  body_template text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true
);

-- ─── app_settings ─────────────────────────────────────────────────────────────
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outlets_updated_at     BEFORE UPDATE ON outlets     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER orders_updated_at      BEFORE UPDATE ON orders      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── indexes untuk performa ────────────────────────────────────────────────────
CREATE INDEX idx_orders_outlet_id     ON orders(outlet_id);
CREATE INDEX idx_orders_status        ON orders(status);
CREATE INDEX idx_orders_expires_at    ON orders(expires_at) WHERE status = 'pending_payment';
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_menu_items_cat       ON menu_items(category_id) WHERE is_active = true;
CREATE INDEX idx_overrides_outlet     ON outlet_menu_overrides(outlet_id);
