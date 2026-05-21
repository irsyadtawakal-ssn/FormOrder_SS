-- Migration: bukti transfer upload flow
-- Jalankan di Supabase SQL Editor

-- 1. Tambah kolom ke orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS proof_url TEXT,
  ADD COLUMN IF NOT EXISTS proof_submitted_at TIMESTAMPTZ;

-- 2. RPC untuk submit bukti transfer (anon bisa call, tapi terproteksi kondisi)
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
    proof_url           = p_proof_url,
    status              = 'awaiting_verification',
    proof_submitted_at  = NOW()
  WHERE order_number = p_order_number
    AND status = 'pending_payment';
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_transfer_proof(TEXT, TEXT) TO anon;

-- 3. RPC untuk admin verifikasi / tolak
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
    SET status = 'pending_payment',
        proof_url = NULL,
        proof_submitted_at = NULL
    WHERE id = p_order_id::uuid
      AND status = 'awaiting_verification';
  END IF;
  RETURN FOUND;
END;
$$;

-- Hanya authenticated (admin) yang bisa call verify_transfer
GRANT EXECUTE ON FUNCTION verify_transfer(TEXT, TEXT) TO authenticated;

-- 4. Storage bucket transfer-proofs
-- Buat manual di Supabase Dashboard → Storage → New Bucket
-- Nama: transfer-proofs, Public: OFF
-- Policy INSERT: allow anon (untuk upload dari customer)
-- Policy SELECT: allow authenticated (untuk admin lihat)
--
-- Atau via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('transfer-proofs', 'transfer-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: customer (anon) bisa upload ke transfer-proofs
CREATE POLICY "anon_upload_proof"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'transfer-proofs');

-- Policy: admin (authenticated) bisa baca semua proof
CREATE POLICY "admin_read_proof"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'transfer-proofs');

-- Policy: admin (authenticated) bisa hapus proof
CREATE POLICY "admin_delete_proof"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'transfer-proofs');

-- 5. Tambah kolom AI verification result
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ai_verification_result JSONB;
