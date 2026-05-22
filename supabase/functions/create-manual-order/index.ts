// Edge Function: create-manual-order
// Buat order tanpa payment gateway — server-side reprice, INSERT orders + order_items
// Status langsung 'paid' (konfirmasi manual oleh admin)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiter: 10 req/menit per IP
const rateMap = new Map<string, { count: number; resetAt: number }>();
function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) { rateMap.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRate(ip)) {
    return Response.json({ error: "Terlalu banyak request. Coba lagi 1 menit." }, { status: 429, headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Baca app_settings ──────────────────────────────────────────────────
    const { data: feeRow } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "service_fee_percent")
      .single();
    const serviceFeeRate = parseFloat(String(feeRow?.value ?? 0.7)) / 100;

    // ── Parse payload ──────────────────────────────────────────────────────
    const body = await req.json();
    const { outlet_slug, customer_name, customer_wa, pickup_time, notes, items } = body;

    if (!outlet_slug || !customer_name || !customer_wa || !pickup_time || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: "Data order tidak lengkap" }, { status: 400, headers: CORS });
    }

    // ── Validasi outlet ────────────────────────────────────────────────────
    const { data: outlet, error: outletErr } = await db
      .from("outlets")
      .select("id, name, is_active")
      .eq("slug", outlet_slug)
      .single();

    if (outletErr || !outlet || !outlet.is_active) {
      return Response.json({ error: "Outlet tidak ditemukan atau tidak aktif" }, { status: 400, headers: CORS });
    }

    // ── Server-side repricing ──────────────────────────────────────────────
    const menuItemIds = [...new Set(items.map((i: { menu_item_id: string }) => i.menu_item_id))];

    const { data: menuItems } = await db
      .from("menu_items")
      .select("id, name, base_price, is_active")
      .in("id", menuItemIds);

    const { data: overrides } = await db
      .from("outlet_menu_overrides")
      .select("menu_item_id, price_override, is_available")
      .eq("outlet_id", outlet.id)
      .in("menu_item_id", menuItemIds);

    const overrideMap = new Map(
      (overrides ?? []).map((o) => [o.menu_item_id, o])
    );

    // Ambil price_modifiers dari variant options
    const allOptionIds = items.flatMap((i: { option_ids?: string[] }) => i.option_ids ?? []);
    const { data: variantOptions } = allOptionIds.length > 0
      ? await db.from("menu_variant_options").select("id, price_modifier").in("id", allOptionIds)
      : { data: [] };
    const optionMap = new Map((variantOptions ?? []).map((o) => [o.id, o.price_modifier]));

    let subtotal = 0;
    const orderItems: {
      menu_item_id: string;
      item_name: string;
      unit_price: number;
      quantity: number;
      subtotal: number;
      selections: Record<string, unknown>;
      note: string | null;
    }[] = [];

    for (const item of items) {
      const menuItem = (menuItems ?? []).find((m) => m.id === item.menu_item_id);
      if (!menuItem || !menuItem.is_active) {
        return Response.json({ error: `Menu "${item.menu_item_id}" tidak tersedia` }, { status: 400, headers: CORS });
      }

      const override = overrideMap.get(item.menu_item_id);
      if (override && override.is_available === false) {
        return Response.json({ error: `Menu "${menuItem.name}" tidak tersedia di outlet ini` }, { status: 400, headers: CORS });
      }

      let unitPrice = override?.price_override ?? menuItem.base_price;
      for (const optId of (item.option_ids ?? [])) {
        unitPrice += optionMap.get(optId) ?? 0;
      }

      const qty = Math.max(1, Math.floor(item.qty ?? 1));
      const itemSubtotal = unitPrice * qty;
      subtotal += itemSubtotal;

      orderItems.push({
        menu_item_id: menuItem.id,
        item_name:    menuItem.name,
        unit_price:   unitPrice,
        quantity:     qty,
        subtotal:     itemSubtotal,
        selections:   item.selections ?? {},
        note:         item.note ?? null,
      });
    }

    const serviceFee = Math.ceil(subtotal * serviceFeeRate);
    const total      = subtotal + serviceFee;

    // ── Generate order number: [KODE]-DDMMYY-NNN ──────────────────────────
    // Kode outlet: 3 huruf pertama dari slug (depok-sukmajaya → DEP, cimanggu → CIM)
    const outletCode = outlet_slug.split("-")[0].slice(0, 3).toUpperCase();

    // Tanggal hari ini dalam format DDMMYY (WIB = UTC+7)
    const now   = new Date(Date.now() + 7 * 60 * 60 * 1000); // UTC → WIB
    const dd    = String(now.getUTCDate()).padStart(2, "0");
    const mm    = String(now.getUTCMonth() + 1).padStart(2, "0");
    const yy    = String(now.getUTCFullYear()).slice(2);
    const today = `${dd}${mm}${yy}`;

    // Hitung jumlah order outlet ini hari ini untuk nomor urut
    const startOfDay = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    ) - 7 * 60 * 60 * 1000).toISOString(); // balik ke UTC untuk filter DB
    const endOfDay   = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
    ) - 7 * 60 * 60 * 1000).toISOString();

    const { count: todayCount } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("outlet_id", outlet.id)
      .gte("created_at", startOfDay)
      .lt("created_at", endOfDay);

    const seq        = String((todayCount ?? 0) + 1).padStart(3, "0");
    const orderNum   = `${outletCode}-${today}-${seq}`;
    const manualRef  = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    // ── INSERT order ───────────────────────────────────────────────────────
    const { data: order, error: orderErr } = await db
      .from("orders")
      .insert({
        outlet_id:           outlet.id,
        customer_name,
        customer_wa,
        pickup_time,
        notes:               notes ?? null,
        subtotal,
        service_fee:         serviceFee,
        total,
        status:              "pending_payment",
        payment_method:      "manual",
        order_number:        orderNum,       // pakai format baru
        tripay_merchant_ref: manualRef,
        expires_at:          new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 jam
      })
      .select("id, order_number")
      .single();

    if (orderErr || !order) {
      return Response.json({ error: orderErr?.message ?? "Gagal membuat order" }, { status: 500, headers: CORS });
    }

    // ── INSERT order_items ─────────────────────────────────────────────────
    const { error: itemsErr } = await db
      .from("order_items")
      .insert(orderItems.map((i) => ({ ...i, order_id: order.id })));

    if (itemsErr) {
      await db.from("orders").update({ status: "cancelled", cancel_reason: "Gagal menyimpan item" }).eq("id", order.id);
      return Response.json({ error: itemsErr.message }, { status: 500, headers: CORS });
    }

    // Trigger notifikasi WA — await dengan timeout 3 detik
    const notifUrl = `${supabaseUrl}/functions/v1/send-wa-notifications`;
    const notifPromise = fetch(notifUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: order.id, event: "new_order" }),
    });
    await Promise.race([
      notifPromise,
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]).catch(() => {});

    return Response.json({
      success:      true,
      order_number: order.order_number,
      order_id:     order.id,
      subtotal,
      service_fee:  serviceFee,
      total,
    }, { headers: CORS });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500, headers: CORS });
  }
});
