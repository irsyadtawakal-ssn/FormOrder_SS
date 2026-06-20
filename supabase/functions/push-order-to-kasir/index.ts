// Edge Function: push-order-to-kasir
// Dipanggil fire-and-forget oleh xendit-webhook setelah order berhasil paid.
// Meneruskan order ke POS Kasir outlet terkait via API route /api/orders/incoming.
//
// Catatan: order-system dan pos-kasir adalah dua project Supabase yang
// terpisah — komunikasi murni lewat HTTP API, tidak ada akses DB lintas project.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const POS_KASIR_URL   = Deno.env.get("POS_KASIR_API_URL");      // https://<pos-kasir-domain>/api/orders/incoming
  const SHARED_SECRET   = Deno.env.get("ORDER_TO_KASIR_SECRET");

  if (!POS_KASIR_URL || !SHARED_SECRET) {
    console.error("POS_KASIR_API_URL / ORDER_TO_KASIR_SECRET belum dikonfigurasi di Supabase Secrets");
    return Response.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }

  let body: { order_id: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400, headers: CORS });
  }

  const { order_id } = body;
  if (!order_id) return Response.json({ error: "order_id wajib" }, { status: 400, headers: CORS });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select(`
      id, customer_name, customer_wa, total, notes, outlet_id, pickup_time, payment_method,
      outlets(pos_outlet_id),
      order_items(item_name, quantity, unit_price)
    `)
    .eq("id", order_id)
    .single();

  if (orderErr || !order) {
    console.error("Order tidak ditemukan untuk push-order-to-kasir:", orderErr);
    return Response.json({ error: "Order tidak ditemukan" }, { status: 404, headers: CORS });
  }

  const outlet = order.outlets as { pos_outlet_id: string | null } | null;
  const posOutletId = outlet?.pos_outlet_id;

  if (!posOutletId) {
    console.error("Outlet belum punya pos_outlet_id (mapping ke POS Kasir):", order.outlet_id);
    return Response.json({ error: "Outlet belum dipetakan ke POS Kasir" }, { status: 400, headers: CORS });
  }

  const items = (order.order_items as { item_name: string; quantity: number; unit_price: number }[]) || [];

  // Format catatan gabungan agar info pelanggan dan pembayaran masuk ke kasir
  // tanpa perlu ada kolom tambahan di database POS Kasir.
  const paymentLabel = order.payment_method === "tripay_qris" ? "QRIS" : (order.payment_method || "Online");
  const pickupLabel = order.pickup_time || "-";
  
  const infoHeader = [
    `-- INFO PEMESAN ONLINE --`,
    `Nama: ${order.customer_name}`,
    `Telp: ${order.customer_wa}`,
    `Pembayaran: ${paymentLabel}`,
    `Ambil: ${pickupLabel}`
  ].join("\n");

  const combinedNotes = order.notes
    ? `${infoHeader}\n\n-- CATATAN PELANGGAN --\n${order.notes}`
    : infoHeader;

  const payload = {
    external_order_id: order.id,
    pos_outlet_id:      posOutletId,
    customer_name:      order.customer_name,
    customer_phone:     order.customer_wa,
    total_amount:       order.total,
    notes:              combinedNotes,
    items: items.map((i) => ({
      menu_item_name: i.item_name,
      quantity:       i.quantity,
      unit_price:     i.unit_price,
      subtotal:       i.unit_price * i.quantity,
    })),
  };

  try {
    const res = await fetch(POS_KASIR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": SHARED_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const resBody = await res.text();

    if (!res.ok) {
      console.error("POS Kasir menolak push order:", res.status, resBody);
      return Response.json({ error: "POS Kasir menolak order" }, { status: 502, headers: CORS });
    }

    console.info("Order berhasil dipush ke POS Kasir:", order.id, resBody);
    return Response.json({ ok: true }, { headers: CORS });
  } catch (err) {
    console.error("Gagal menghubungi POS Kasir:", err);
    return Response.json({ error: "Gagal menghubungi POS Kasir" }, { status: 502, headers: CORS });
  }
});
