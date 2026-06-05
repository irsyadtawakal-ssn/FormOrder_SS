import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function tg(token: string, chat: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "Markdown" }),
  }).catch(() => {});
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const URL = Deno.env.get("SUPABASE_URL")!;
  const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const TG_CHAT = Deno.env.get("TELEGRAM_CHAT_ID")!;

  // ─── Verifikasi JWT + check role service_role ─────────────────────────────
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });

  // Decode JWT payload (base64url decode, no signature verification needed for Supabase internal JWT)
  const parts = jwt.split(".");
  if (parts.length !== 3) return Response.json({ error: "Invalid JWT" }, { status: 401, headers: CORS });

  let payload: Record<string, unknown>;
  try {
    const decoded = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    payload = JSON.parse(decoded);
  } catch {
    return Response.json({ error: "Invalid JWT" }, { status: 401, headers: CORS });
  }

  if (payload.role !== "service_role") {
    return Response.json({ error: "Forbidden" }, { status: 403, headers: CORS });
  }

  const db = createClient(URL, SRV, { auth: { persistSession: false } });
  const issues: { key: string; msg: string }[] = [];

  // 1. Order nyangkut pending_payment > 15 mnt
  const cut = new Date(Date.now() - 15 * 60000).toISOString();
  const { count: stuckCount } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_payment")
    .lt("created_at", cut);
  if ((stuckCount ?? 0) > 0) {
    issues.push({ key: "stuck_pending", msg: `⚠️ ${stuckCount} order nyangkut belum bayar > 15 menit` });
  }

  // 2. Cron mati > 5 mnt
  const { data: hb } = await db.from("cron_heartbeat").select("*");
  for (const c of hb ?? []) {
    const ageMin = (Date.now() - new Date(c.last_run).getTime()) / 60000;
    if (ageMin > 5) {
      issues.push({ key: `cron_dead:${c.job_name}`, msg: `🔴 Cron *${c.job_name}* tidak jalan > 5 menit` });
    }
  }

  // 3. Notif gagal banyak (60 mnt)
  const h1 = new Date(Date.now() - 3600000).toISOString();
  const { count: failCount } = await db
    .from("notification_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("sent_at", h1);
  if ((failCount ?? 0) >= 5) {
    issues.push({ key: "notif_fail", msg: `🔴 ${failCount} WA notif gagal dalam 60 menit` });
  }

  // 4. Nol order di jam buka
  const jam = new Date().getHours();
  if (jam >= 13 && jam <= 22) {
    const { count: lastHour } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", h1);
    if ((lastHour ?? 0) === 0) {
      issues.push({ key: "zero_orders", msg: `🔴 NOL order dalam 60 menit (jam buka)` });
    }
  }

  const firingKeys = new Set(issues.map(i => i.key));
  const { data: states } = await db.from("alert_state").select("*");
  const stateMap = new Map((states ?? []).map(s => [s.alert_key, s]));

  // Kirim alert baru (firing)
  for (const i of issues) {
    const prev = stateMap.get(i.key);
    if (!prev || prev.status === "resolved") {
      await tg(TG_TOKEN, TG_CHAT, i.msg);
      await db
        .from("alert_state")
        .upsert(
          { alert_key: i.key, status: "firing", alerted_at: new Date().toISOString(), resolved_at: null },
          { onConflict: "alert_key" }
        );
      await db.from("system_events").insert({
        source: "monitor",
        level: "error",
        event_type: "alert_sent",
        message: i.msg,
      });
    }
  }

  // Tandai pulih
  for (const s of states ?? []) {
    if (s.status === "firing" && !firingKeys.has(s.alert_key)) {
      await tg(TG_TOKEN, TG_CHAT, `✅ Pulih: ${s.alert_key}`);
      await db
        .from("alert_state")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("alert_key", s.alert_key);
      await db.from("system_events").insert({
        source: "monitor",
        level: "info",
        event_type: "alert_resolved",
        message: `Pulih: ${s.alert_key}`,
      });
    }
  }

  // ─── Kapasitas Supabase (estimasi, cek free tier limits) ────────────────────
  // DB: 500MB = 500000000 bytes; Storage: 1GB = 1000000000 bytes
  const FREE_TIER_DB = 500000000;
  const FREE_TIER_STORAGE = 1000000000;

  let dbSize = 0;
  let storageSize = 0;

  try {
    // Query DB size menggunakan pg_database_size
    const { data: dbResult } = await db.rpc("get_db_size_bytes");
    if (dbResult) dbSize = dbResult;
  } catch { /* abaikan error */ }

  try {
    // Query storage (list semua objects di semua buckets, hitung size)
    const { data: buckets } = await db.storage.listBuckets();
    for (const bucket of buckets || []) {
      try {
        const { data: files } = await db.storage.from(bucket.name).list("", { limit: 1000 });
        for (const f of files || []) {
          storageSize += f.metadata?.size || 0;
        }
      } catch { /* abaikan per-bucket */ }
    }
  } catch { /* abaikan */ }

  const snap = {
    ok: true,
    firing: issues.length,
    capacity: {
      db_bytes: dbSize,
      db_percent: Math.round((dbSize / FREE_TIER_DB) * 100),
      storage_bytes: storageSize,
      storage_percent: Math.round((storageSize / FREE_TIER_STORAGE) * 100),
    },
  };

  return Response.json(snap, { headers: CORS });
});
