-- Tambah status proof_rejected: saat admin tolak bukti transfer
-- Customer perlu upload ulang bukti yang benar
-- Jalankan di Supabase SQL Editor

-- 1. Update constraint status orders
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending_payment',
    'proof_rejected',
    'awaiting_verification',
    'paid',
    'preparing',
    'ready',
    'done',
    'cancelled',
    'expired'
  ));

-- 2. Update submit_transfer_proof: terima upload dari status proof_rejected juga
CREATE OR REPLACE FUNCTION submit_transfer_proof(
  p_order_number TEXT,
  p_proof_url    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE orders
  SET
    proof_url          = p_proof_url,
    status             = 'awaiting_verification',
    proof_submitted_at = NOW()
  WHERE order_number = p_order_number
    AND status IN ('pending_payment', 'proof_rejected');
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_transfer_proof(TEXT, TEXT) TO anon;

-- 3. Update verify_transfer: reject → proof_rejected (bukan pending_payment)
CREATE OR REPLACE FUNCTION verify_transfer(
  p_order_id TEXT,
  p_action   TEXT  -- 'approve' atau 'reject'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_action = 'approve' THEN
    UPDATE orders
    SET status = 'paid'
    WHERE id = p_order_id::uuid
      AND status = 'awaiting_verification';
  ELSIF p_action = 'reject' THEN
    UPDATE orders
    SET status             = 'proof_rejected',
        proof_url          = NULL,
        proof_submitted_at = NULL
    WHERE id = p_order_id::uuid
      AND status = 'awaiting_verification';
  END IF;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_transfer(TEXT, TEXT) TO authenticated;
