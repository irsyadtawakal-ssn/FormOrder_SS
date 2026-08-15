// Edge Function: pull-online-order
// Dipanggil oleh POS native (dan boleh juga oleh web nantinya) saat ada order
// baru berstatus 'paid' di project ini. Menarik data order dari project ini
// dan menuliskannya ke tabel `orders`/`order_items` milik project POS utama —
// port dari apps/pos-kasir/app/api/orders/pull-online/route.ts, supaya native
// tidak perlu pos-kasir hidup untuk menerima order website.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { external_order_id: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400, headers: CORS });
  }
  const { external_order_id } = body;
  if (!external_order_id) {
    return Response.json({ error: "external_order_id wajib diisi" }, { status: 400, headers: CORS });
  }

  const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const POS_URL        = Deno.env.get("POS_SUPABASE_URL");
  const POS_SERVICE_KEY = Deno.env.get("POS_SUPABASE_SERVICE_ROLE_KEY");
  if (!POS_URL || !POS_SERVICE_KEY) {
    console.error("POS_SUPABASE_URL / POS_SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi");
    return Response.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }

  const ssOrderDb = createClient(SUPABASE_URL, SERVICE_KEY);
  const posDb = createClient(POS_URL, POS_SERVICE_KEY);

  // 1. Idempotency ketat: order ini sudah pernah ditarik?
  const { data: existingList } = await posDb
    .from("orders")
    .select("id, order_number, source, external_order_id")
    .or(`id.eq.${external_order_id},external_order_id.eq.${external_order_id}`)
    .limit(1);
  let existing = existingList && existingList.length > 0 ? existingList[0] : null;

  if (existing) {
    if (existing.id === external_order_id && existing.source !== "online") {
      await posDb.from("orders").update({
        source: "online",
        sales_source: "online",
        external_order_id,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    }
    return Response.json({
      success: true, message: "Order sudah ditarik sebelumnya",
      order_id: existing.id, order_number: existing.order_number,
    }, { headers: CORS });
  }

  // 2. Ambil order dari project ini
  const { data: order, error: orderErr } = await ssOrderDb
    .from("orders")
    .select(`
      id, customer_name, customer_wa, total, notes, outlet_id, pickup_time,
      outlets!inner(pos_outlet_id),
      order_items(item_name, quantity, unit_price, note)
    `)
    .eq("id", external_order_id)
    .single();

  if (orderErr || !order) {
    return Response.json({ error: "Order tidak ditemukan" }, { status: 404, headers: CORS });
  }

  const posOutletId = Array.isArray(order.outlets)
    ? (order.outlets[0] as any)?.pos_outlet_id
    : (order.outlets as any)?.pos_outlet_id;
  if (!posOutletId) {
    return Response.json({ error: "Outlet belum dipetakan ke POS (pos_outlet_id kosong)" }, { status: 400, headers: CORS });
  }

  // 3. Soft-match fallback: cegah duplikasi kalau kasir sudah input manual duluan
  if (!existing) {
    const timeLimit = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: softMatchList } = await posDb
      .from("orders")
      .select("id, order_number, source, external_order_id")
      .eq("outlet_id", posOutletId)
      .eq("customer_name", order.customer_name)
      .eq("total_amount", order.total)
      .is("external_order_id", null)
      .gte("created_at", timeLimit)
      .limit(1);

    if (softMatchList && softMatchList.length > 0) {
      existing = softMatchList[0];
      if (existing.source !== "online" || !existing.external_order_id) {
        await posDb.from("orders").update({
          source: "online", sales_source: "online", external_order_id,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      }
      return Response.json({
        success: true, message: "Order sudah ditarik sebelumnya (via soft-match)",
        order_id: existing.id, order_number: existing.order_number,
      }, { headers: CORS });
    }
  }

  // 4. Insert order + items
  const { data: newOrder, error: insertErr } = await posDb
    .from("orders")
    .insert({
      outlet_id: posOutletId,
      customer_name: order.customer_name,
      customer_phone: order.customer_wa,
      notes: order.notes || null,
      payment_method: "qris",
      total_amount: order.total,
      status: "preparing",
      source: "online",
      sales_source: "online",
      external_order_id: order.id,
      pickup_time: order.pickup_time || null,
    })
    .select("id, order_number")
    .single();

  if (insertErr || !newOrder) {
    if ((insertErr as any)?.code === "23505") {
      const { data: retryList } = await posDb
        .from("orders")
        .select("id, order_number")
        .or(`id.eq.${external_order_id},external_order_id.eq.${external_order_id}`)
        .limit(1);
      if (retryList && retryList.length > 0) {
        return Response.json({
          success: true, message: "Order sudah ditarik sebelumnya (race condition)",
          order_id: retryList[0].id, order_number: retryList[0].order_number,
        }, { headers: CORS });
      }
    }
    console.error("Gagal insert order ke POS:", insertErr);
    return Response.json({ error: "Gagal menyimpan pesanan" }, { status: 500, headers: CORS });
  }

  const items = order.order_items || [];
  if (items.length > 0) {
    const { error: itemsErr } = await posDb.from("order_items").insert(
      items.map((i: any) => ({
        order_id: newOrder.id,
        menu_item_id: null,
        menu_item_name: i.note ? `${i.item_name}|NOTE|${i.note}` : i.item_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.unit_price * i.quantity,
      }))
    );
    if (itemsErr) console.error("Gagal insert order_items:", itemsErr);
  }

  return Response.json({
    success: true, order_id: newOrder.id, order_number: newOrder.order_number,
  }, { headers: CORS });
});
