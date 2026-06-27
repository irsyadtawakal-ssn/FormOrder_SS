// Edge Function: sync-status-to-pos
// Dipanggil oleh database trigger saat status order berubah ke 'done' atau 'cancelled'.
// Meneruskan update status ke POS Kasir.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SHARED_SECRET = Deno.env.get("ORDER_TO_KASIR_SECRET");

  let updateStatusUrl = Deno.env.get("POS_KASIR_UPDATE_STATUS_URL");
  if (!updateStatusUrl) {
    const posKasirApiUrl = Deno.env.get("POS_KASIR_API_URL");
    if (posKasirApiUrl) {
      updateStatusUrl = posKasirApiUrl.replace("/incoming", "/update-status");
    }
  }

  if (!updateStatusUrl || !SHARED_SECRET) {
    console.error("POS_KASIR_UPDATE_STATUS_URL / POS_KASIR_API_URL atau ORDER_TO_KASIR_SECRET belum dikonfigurasi");
    return Response.json({ error: "Configuration missing" }, { status: 500, headers: CORS });
  }

  let body: { order_id: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400, headers: CORS });
  }

  const { order_id } = body;
  if (!order_id) {
    return Response.json({ error: "order_id wajib" }, { status: 400, headers: CORS });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, status")
    .eq("id", order_id)
    .maybeSingle();

  if (orderErr || !order) {
    console.error("Order tidak ditemukan untuk sync-status-to-pos:", order_id, orderErr);
    return Response.json({ error: "Order tidak ditemukan" }, { status: 404, headers: CORS });
  }

  let mappedStatus: string;
  if (order.status === "done") {
    mappedStatus = "completed";
  } else if (order.status === "cancelled") {
    mappedStatus = "cancelled";
  } else {
    console.warn(`Status order '${order.status}' tidak didukung untuk disinkronkan`);
    return Response.json({ ok: false, message: `Status '${order.status}' tidak di-sinkronkan` }, { headers: CORS });
  }

  const payload = {
    external_order_id: order.id,
    status: mappedStatus,
  };

  try {
    const res = await fetch(updateStatusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": SHARED_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const resBody = await res.text();

    if (!res.ok) {
      console.error("POS Kasir menolak update status:", res.status, resBody);
      return Response.json({ error: "POS Kasir menolak update status" }, { status: 502, headers: CORS });
    }

    console.info("Status order berhasil disinkronkan ke POS Kasir:", order.id, mappedStatus, resBody);
    return Response.json({ ok: true, message: "Status synchronized" }, { headers: CORS });
  } catch (err) {
    console.error("Gagal menghubungi POS Kasir untuk sync status:", err);
    return Response.json({ error: "Gagal menghubungi POS Kasir" }, { status: 502, headers: CORS });
  }
});
