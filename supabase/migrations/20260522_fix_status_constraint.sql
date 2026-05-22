-- Fix: tambah status awaiting_verification dan expired ke check constraint orders
-- Jalankan di Supabase SQL Editor

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending_payment',
    'awaiting_verification',
    'paid',
    'preparing',
    'ready',
    'done',
    'cancelled',
    'expired'
  ));
