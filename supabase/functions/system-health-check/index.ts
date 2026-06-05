import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SRV_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FONNTE = Deno.env.get("FONNTE_TOKEN");
  const XENDIT = Deno.env.get("XENDIT_SECRET_KEY");

  // ─── Verifikasi JWT & pemanggil super_admin ──────────────────────────────────
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });

  const db = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });
  const { data: prof } = await db.from("admin_users").select("role").eq("id", user.id).single();
  if (prof?.role !== "super_admin") return Response.json({ error: "Forbidden" }, { status: 403, headers: CORS });

  const snap: Record<string, unknown> = { checked_at: new Date().toISOString() };

  // ─── Fonnte device status ────────────────────────────────────────────────────
  if (FONNTE) {
    try {
      const r = await fetch("https://api.fonnte.com/device", {
        method: "POST",
        headers: { Authorization: FONNTE },
      });
      const j = await r.json();
      snap.fonnte = {
        connected: j?.device_status === "connect" || j?.status === true,
        raw: j?.device_status ?? null,
      };
    } catch (e) {
      snap.fonnte = { connected: null, error: String(e) };
    }
  }

  // ─── Ping eksternal ──────────────────────────────────────────────────────────
  snap.ping = {};
  for (const [k, url] of [
    ["site", "https://order.sukashawarma.com"],
    ["xendit", "https://api.xendit.co"],
  ]) {
    try {
      const t0 = Date.now();
      const r = await fetch(url, { method: "HEAD" });
      (snap.ping as any)[k] = { ok: r.status < 500, ms: Date.now() - t0 };
    } catch (e) {
      (snap.ping as any)[k] = { ok: false, error: String(e) };
    }
  }

  // ─── Rekonsiliasi Xendit: order pending_payment lama yang mungkin sudah PAID ─
  const cut = new Date(Date.now() - 15 * 60000).toISOString();
  const { data: stale } = await db
    .from("orders")
    .select("id, order_number, tripay_reference")
    .eq("status", "pending_payment")
    .lt("created_at", cut)
    .not("tripay_reference", "is", null);

  let mismatched: string[] = [];
  if (XENDIT && stale && stale.length > 0) {
    for (const o of stale) {
      try {
        const r = await fetch(
          `https://api.xendit.co/payment_requests/${o.tripay_reference}`,
          { headers: { Authorization: "Basic " + btoa(XENDIT + ":") } }
        );
        const j = (await r.json()) as Record<string, unknown>;
        if (["SUCCEEDED", "PAID", "COMPLETED"].includes(j.status as string)) {
          mismatched.push(o.order_number);
        }
      } catch {
        // abaikan per-order error
      }
    }
  }
  snap.reconcile = {
    stale_pending: stale?.length ?? 0,
    paid_but_unsynced: mismatched,
  };

  return Response.json(snap, { headers: CORS });
});
