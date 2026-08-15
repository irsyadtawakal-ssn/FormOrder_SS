// Edge Function: sync-active-orders
// Dipanggil native saat WebSocket reconnect untuk menangkap perubahan status
// yang terlewat selama socket putus — port dari
// apps/pos-kasir/app/api/orders/sync-active/route.ts, supaya native tidak
// perlu pos-kasir hidup untuk sinkronisasi ulang order online yang "nyangkut".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const POS_URL        = Deno.env.get("POS_SUPABASE_URL");
  const POS_SERVICE_KEY = Deno.env.get("POS_SUPABASE_SERVICE_ROLE_KEY");
  if (!POS_URL || !POS_SERVICE_KEY) {
    console.error("POS_SUPABASE_URL / POS_SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi");
    return Response.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }

  const posDb = createClient(POS_URL, POS_SERVICE_KEY);
  const ssOrderDb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // 1. Ambil pesanan online yang masih gantung di POS
    const { data: localOrders, error: localErr } = await posDb
      .from("orders")
      .select("id, external_order_id, status")
      .eq("source", "online")
      .in("status", ["pending", "preparing", "ready"]);

    if (localErr) {
      console.error("sync-active-orders: gagal get local orders", localErr);
      return Response.json({ error: localErr.message }, { status: 500, headers: CORS });
    }

    if (!localOrders || localOrders.length === 0) {
      return Response.json({ success: true, synced: 0, message: "No pending online orders" }, { headers: CORS });
    }

    const externalIds = localOrders.map((o) => o.external_order_id).filter(Boolean);
    if (externalIds.length === 0) {
      return Response.json({ success: true, synced: 0 }, { headers: CORS });
    }

    // 2. Tanya status terbarunya ke tabel orders project ini
    const { data: remoteOrders, error: remoteErr } = await ssOrderDb
      .from("orders")
      .select("id, status")
      .in("id", externalIds);

    if (remoteErr) {
      console.error("sync-active-orders: gagal get remote orders", remoteErr);
      return Response.json({ error: remoteErr.message }, { status: 500, headers: CORS });
    }

    if (!remoteOrders || remoteOrders.length === 0) {
      return Response.json({ success: true, synced: 0 }, { headers: CORS });
    }

    // 3. Bandingkan dan update jika perlu
    let syncedCount = 0;
    for (const local of localOrders) {
      const remote = remoteOrders.find((r) => r.id === local.external_order_id);
      if (!remote) continue;

      if (remote.status === "done" || remote.status === "ready" || remote.status === "cancelled") {
        const mappedStatus = (remote.status === "done" || remote.status === "ready") ? "completed" : "cancelled";

        if (local.status !== mappedStatus) {
          console.log(`sync-active-orders: update pesanan ${local.external_order_id} -> ${mappedStatus}`);
          const { error: updateErr } = await posDb
            .from("orders")
            .update({ status: mappedStatus, updated_at: new Date().toISOString() })
            .eq("id", local.id);

          if (!updateErr) {
            syncedCount++;
          } else {
            console.error("sync-active-orders: gagal update local order", updateErr);
          }
        }
      }
    }

    return Response.json({ success: true, synced: syncedCount }, { headers: CORS });
  } catch (err: any) {
    console.error("sync-active-orders error:", err);
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
});
