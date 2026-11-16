-- Tambah kolom status ('active' | 'pending' | 'inactive') pada tabel outlets
-- serta index pencarian cepat untuk sinkronisasi outlet & akun otomatis dari Admin Dashboard.

ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.outlets
SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END
WHERE status IS NULL;

ALTER TABLE public.outlets
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outlets'::regclass
      AND conname = 'outlets_status_check'
  ) THEN
    ALTER TABLE public.outlets
      ADD CONSTRAINT outlets_status_check CHECK (status IN ('active', 'pending', 'inactive'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outlets_pos_outlet_id ON public.outlets(pos_outlet_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_outlet_id ON public.admin_users(outlet_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_email_lower ON public.admin_users(lower(email));
