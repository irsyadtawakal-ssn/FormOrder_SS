// Edge Function: kasir-order-cancel
// Dipanggil oleh POS Kasir saat order dibatalkan (cancelled).
// Mengubah status order online menjadi 'cancelled' dan mengirim notifikasi WhatsApp.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Perbandingan constant-time untuk cegah timing attack pada token comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SHARED_SECRET = Deno.env.get("KASIR_TO_ORDER_SECRET");
  if (!SHARED_SECRET) {
    console.error("KASIR_TO_ORDER_SECRET belum dikonfigurasi di Supabase Secrets");
    return Response.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }

  const incomingToken = req.headers.get("x-internal-token") ?? "";
  if (!incomingToken || !timingSafeEqual(incomingToken, SHARED_SECRET)) {
    console.error("Token POS Kasir tidak valid");
    return Response.json({ error: "Forbidden" }, { status: 403, headers: CORS });
  }

  let body: { external_order_id: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400, headers: CORS });
  }

  const { external_order_id } = body;
  if (!external_order_id) {
    return Response.json({ error: "external_order_id wajib" }, { status: 400, headers: CORS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Cari order berdasarkan external_order_id (yaitu id di orders)
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, status")
    .eq("id", external_order_id)
    .maybeSingle();

  if (orderErr || !order) {
    console.error("Order tidak ditemukan untuk kasir-order-cancel:", external_order_id, orderErr);
    return Response.json({ error: "Order tidak ditemukan" }, { status: 404, headers: CORS });
  }

  // Idempoten: jika sudah dibatalkan, jangan lakukan perubahan atau trigger ulang
  if (order.status === "cancelled") {
    return Response.json({ ok: true, message: "Sudah dibatalkan sebelumnya (idempoten)" }, { headers: CORS });
  }

  // Update order's status to 'cancelled' dan set cancelled_at
  const { error: updateErr } = await db
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (updateErr) {
    console.error("Gagal update order ke cancelled:", updateErr);
    return Response.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }

  console.info("Order diupdate ke cancelled via POS Kasir:", order.id);

  // Trigger send-wa-notifications asynchronously
  fetch(`${SUPABASE_URL}/functions/v1/send-wa-notifications`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: order.id, event: "cancelled" }),
  }).catch((err) => console.error("Gagal trigger send-wa-notifications:", err));

  return Response.json({ ok: true, message: "Order diupdate ke cancelled" }, { headers: CORS });
});
