-- 20260604_monitoring.sql — Tabel pendukung dashboard monitoring sistem

-- ─── system_events: log error/event terpusat ─────────────────────────────────
CREATE TABLE IF NOT EXISTS system_events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source      text NOT NULL,
  level       text NOT NULL CHECK (level IN ('info','warn','error')),
  event_type  text NOT NULL,
  message     text NOT NULL,
  context     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);

-- ─── cron_heartbeat: bukti cron masih hidup ───────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_heartbeat (
  job_name  text PRIMARY KEY,
  last_run  timestamptz NOT NULL DEFAULT now()
);

-- ─── alert_state: anti-spam alert ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_state (
  alert_key   text PRIMARY KEY,
  status      text NOT NULL CHECK (status IN ('firing','resolved')),
  alerted_at  timestamptz,
  resolved_at timestamptz
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE system_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_state    ENABLE ROW LEVEL SECURITY;

-- super_admin boleh SELECT semua; INSERT/UPDATE hanya service_role (bypass RLS)
CREATE POLICY "system_events_admin_select" ON system_events
  FOR SELECT TO authenticated USING (get_my_role() = 'super_admin');
CREATE POLICY "cron_heartbeat_admin_select" ON cron_heartbeat
  FOR SELECT TO authenticated USING (get_my_role() = 'super_admin');
CREATE POLICY "alert_state_admin_select" ON alert_state
  FOR SELECT TO authenticated USING (get_my_role() = 'super_admin');
