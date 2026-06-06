// Edge Function: on-order-done
// Dipanggil saat order status → paid
// 1. Hitung favorite_menu dan favorite_outlet dari histori order customer
// 2. Upsert customer (wa_number, nama, stats, favorite)
//
// LOYALTY FROZEN: milestone, voucher, WA notif loyalty dikomentari
// Aktifkan kembali saat Phase 9 dilanjutkan

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// LOYALTY FROZEN
// const FONNTE_URL = "https://api.fonnte.com/send";
// async function kirimWA(...) { ... }
// function generateVoucherCode(): string { ... }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { order_id: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400, headers: CORS });
  }

  const { order_id } = body;
  if (!order_id) return Response.json({ error: "order_id wajib" }, { status: 400, headers: CORS });

  // ── Ambil order ──────────────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, customer_name, customer_wa, total, status, outlet_id, outlets(id, name)")
    .eq("id", order_id)
    .single();

  if (orderErr || !order || order.status !== "paid") {
    return Response.json({ error: "Order tidak valid atau belum paid" }, { status: 400, headers: CORS });
  }

  // ── Hitung total order + spent customer ini ───────────────────────────────────
  const { count: totalOrders } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_wa", order.customer_wa)
    .in("status", ["paid", "preparing", "ready", "done"]);

  const { data: spentRows } = await db
    .from("orders")
    .select("total")
    .eq("customer_wa", order.customer_wa)
    .in("status", ["paid", "preparing", "ready", "done"]);

  const totalSpent = (spentRows || []).reduce(
    (s: number, o: { total: number }) => s + (o.total || 0), 0
  );

  // ── Hitung outlet favorit ─────────────────────────────────────────────────────
  const { data: outletRows } = await db
    .from("orders")
    .select("outlet_id")
    .eq("customer_wa", order.customer_wa)
    .in("status", ["paid", "preparing", "ready", "done"]);

  const outletCount: Record<string, number> = {};
  (outletRows || []).forEach((o: { outlet_id: string }) => {
    if (o.outlet_id) outletCount[o.outlet_id] = (outletCount[o.outlet_id] || 0) + 1;
  });
  const favoriteOutletId = Object.entries(outletCount)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // ── Hitung menu favorit ───────────────────────────────────────────────────────
  const { data: orderIds } = await db
    .from("orders")
    .select("id")
    .eq("customer_wa", order.customer_wa)
    .in("status", ["paid", "preparing", "ready", "done"]);

  const ids = (orderIds || []).map((o: { id: string }) => o.id);
  let favoriteMenu: string | null = null;

  if (ids.length > 0) {
    const { data: itemRows } = await db
      .from("order_items")
      .select("item_name")
      .in("order_id", ids);

    const menuCount: Record<string, number> = {};
    (itemRows || []).forEach((i: { item_name: string }) => {
      if (i.item_name) menuCount[i.item_name] = (menuCount[i.item_name] || 0) + 1;
    });
    favoriteMenu = Object.entries(menuCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  // ── Upsert customer ──────────────────────────────────────────────────────────
  const { data: existing } = await db
    .from("customers")
    .select("first_order_at")
    .eq("wa_number", order.customer_wa)
    .single();

  await db.from("customers").upsert({
    wa_number:           order.customer_wa,
    name:                order.customer_name,
    total_orders:        totalOrders || 0,
    total_spent:         totalSpent,
    first_order_at:      existing?.first_order_at || new Date().toISOString(),
    last_order_at:       new Date().toISOString(),
    favorite_menu:       favoriteMenu,
    favorite_outlet_id:  favoriteOutletId,
    updated_at:          new Date().toISOString(),
  }, { onConflict: "wa_number" });

  // ── Catat heartbeat ───────────────────────────────────────────────────────────
  try {
    await db.from("cron_heartbeat").upsert(
      { job_name: "on-order-done", last_run: new Date().toISOString() },
      { onConflict: "job_name" },
    );
  } catch { /* abaikan */ }

  // LOYALTY FROZEN — milestone, voucher, WA notif dikomentari
  // Aktifkan kembali saat Phase 9 dilanjutkan:
  //
  // const { data: settingsRows } = await db.from("app_settings")...
  // const milestones = [1, 2, 3].map(n => ({ count: ..., reward: ... }));
  // const hit = milestones.find(m => m.count === totalOrders);
  // if (hit) {
  //   // generate voucher code, insert vouchers, kirim WA notif
  // }

  return Response.json({
    ok:                  true,
    total_orders:        totalOrders,
    favorite_menu:       favoriteMenu,
    favorite_outlet_id:  favoriteOutletId,
  }, { headers: CORS });
});
