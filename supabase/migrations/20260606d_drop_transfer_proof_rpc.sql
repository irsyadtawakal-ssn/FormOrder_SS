-- Migration: hapus RPC transfer proof yang sudah tidak dipakai
-- Phase 8 (transfer manual) sudah diganti Xendit di Phase 10.
-- Status awaiting_verification & proof_rejected sudah dihapus dari constraint
-- di 20260603_xendit_channels.sql, tapi RPC-nya belum ikut dihapus.

DROP FUNCTION IF EXISTS submit_transfer_proof(TEXT, TEXT);
DROP FUNCTION IF EXISTS verify_transfer(TEXT, TEXT);
