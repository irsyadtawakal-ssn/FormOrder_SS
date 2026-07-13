// Edge Function: auto-cancel-expired-orders
// Tandai order pending_payment yang sudah melewati expires_at menjadi 'expired'
// Dipanggil via pg_cron (tiap 1 menit) atau manual via HTTP POST

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FONNTE_TOKEN = Deno.env.get("FONNTE_TOKEN");

  // Hanya service role yang boleh memanggil fungsi ini
  const authHeader = req.headers.get("authorization") ?? "";
  const token      = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (token !== SERVICE_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();

  // Ambil order yang sudah expired (pending_payment & melewati expires_at)
  const { data: expiredOrders, error: fetchErr } = await db
    .from("orders")
    .select("id, order_number, customer_name, customer_wa, outlets(name)")
    .eq("status", "pending_payment")
    .lt("expires_at", now);

  if (fetchErr) {
    console.error("Gagal ambil expired orders:", fetchErr.message);
    return Response.json({ error: fetchErr.message }, { status: 500, headers: CORS });
  }

  if (!expiredOrders || expiredOrders.length === 0) {
    // Catat heartbeat — bukti cron masih hidup (best-effort, tidak gagalkan response)
    try {
      await db.from("cron_heartbeat").upsert(
        { job_name: "auto-cancel-expired-orders", last_run: new Date().toISOString() },
        { onConflict: "job_name" },
      );
    } catch { /* abaikan agar tidak gagalkan cron */ }
    return Response.json({ ok: true, expired_count: 0 }, { headers: CORS });
  }

  const ids = expiredOrders.map((o) => o.id);

  // Tandai semua sebagai expired sekaligus
  const { error: updateErr } = await db
    .from("orders")
    .update({
      status:        "expired",
      cancelled_at:  now,
      cancel_reason: "Batas waktu pembayaran habis (otomatis)",
    })
    .in("id", ids);

  if (updateErr) {
    console.error("Gagal update expired orders:", updateErr.message);
    return Response.json({ error: updateErr.message }, { status: 500, headers: CORS });
  }

  console.log(`auto-expire: ${expiredOrders.length} order → expired`, ids);

  // Kirim WA ke customer — best-effort, tidak gagalkan response
  if (FONNTE_TOKEN) {
    for (const order of expiredOrders) {
      if (!order.customer_wa) continue;
      const outletName = (order.outlets as { name: string } | null)?.name ?? "outlet";
      const pesan =
        `⏰ *Waktu Pembayaran Habis*\n\n` +
        `Halo ${order.customer_name},\n` +
        `Pesanan *${order.order_number}* di ${outletName} sudah kedaluwarsa karena pembayaran tidak ` +
        `diselesaikan tepat waktu.\n\n` +
        `Silakan pesan ulang jika masih berminat. Terima kasih 🙏`;
      await fetch("https://api.fonnte.com/send", {
        method:  "POST",
        headers: { "Authorization": FONNTE_TOKEN, "Content-Type": "application/json" },
        body:    JSON.stringify({ target: order.customer_wa, message: pesan }),
      }).catch(() => {/* abaikan error WA agar tidak gagalkan batch */});
    }
  }

  // Catat heartbeat — bukti cron masih hidup (best-effort, tidak gagalkan response)
  try {
    await db.from("cron_heartbeat").upsert(
      { job_name: "auto-cancel-expired-orders", last_run: new Date().toISOString() },
      { onConflict: "job_name" },
    );
  } catch { /* abaikan agar tidak gagalkan cron */ }

  return Response.json({
    ok:             true,
    expired_count:  expiredOrders.length,
    expired_orders: expiredOrders.map((o) => o.order_number),
  }, { headers: CORS });
});
