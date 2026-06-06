-- Migration: hapus kolom sisa era transfer manual (Phase 8)
-- Kolom ini tidak lagi dipakai setelah pindah ke Xendit di Phase 10.
-- RPC submit_transfer_proof & verify_transfer sudah di-DROP di 20260606d.

ALTER TABLE orders
  DROP COLUMN IF EXISTS proof_url,
  DROP COLUMN IF EXISTS proof_submitted_at,
  DROP COLUMN IF EXISTS ai_verification_result;
