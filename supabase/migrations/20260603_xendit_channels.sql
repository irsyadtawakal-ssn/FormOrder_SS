-- Migration: Phase 11 — Xendit multi-channel payment columns
-- Tambah kolom untuk support Virtual Account & E-Wallet

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_channel    text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS va_number          text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS va_bank            text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ewallet_deeplink   text;

-- Update constraint payment_method: tambah xendit_va dan xendit_ewallet
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'manual'::text,
    'tripay_qris'::text,
    'xendit_qris'::text,
    'xendit_va'::text,
    'xendit_ewallet'::text,
    'cash'::text
  ]));

-- Update constraint status: hapus proof_rejected & awaiting_verification
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending_payment'::text,
    'paid'::text,
    'preparing'::text,
    'ready'::text,
    'done'::text,
    'cancelled'::text,
    'expired'::text
  ]));
