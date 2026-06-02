// Edge Function: create-xendit-payment
// Validasi order, hitung harga server-side, buat QRIS dinamis via Xendit Payment Request API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Rate Limiter (in-memory, 10 req/menit per IP) ───────────────────────────
const rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Rate limit per IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRate(ip)) {
    return json(
      { error: "Terlalu banyak permintaan. Coba lagi dalam 1 menit." },
      429,
    );
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body tidak valid" }, 400);
  }

  const { outlet_slug, items, customer_name, customer_wa, pickup_time, notes } =
    body as Record<string, unknown>;

  // ─── Validasi input ──────────────────────────────────────────────────────
  if (!outlet_slug || typeof outlet_slug !== "string") {
    return json({ error: "outlet_slug diperlukan" }, 400);
  }
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: "items tidak boleh kosong" }, 400);
  }
  if (
    !customer_name ||
    typeof customer_name !== "string" ||
    customer_name.trim().length < 2
  ) {
    return json({ error: "Nama pemesan tidak valid (min 2 karakter)" }, 400);
  }
  if (!customer_wa || !pickup_time) {
    return json({ error: "Data pemesan tidak lengkap" }, 400);
  }

  // Normalisasi nomor WA → format 628xxx
  const waRaw = String(customer_wa).replace(/\D/g, "");
  let waNorm: string;
  if (waRaw.startsWith("08")) {
    waNorm = "62" + waRaw.slice(1);
  } else if (waRaw.startsWith("628")) {
    waNorm = waRaw;
  } else {
    return json(
      { error: "Format nomor WhatsApp tidak valid (08xxx atau 628xxx)" },
      400,
    );
  }
  if (waNorm.length < 10 || waNorm.length > 15) {
    return json({ error: "Panjang nomor WhatsApp tidak valid" }, 400);
  }

  // ─── Init Supabase service role ───────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ─── Validasi outlet ─────────────────────────────────────────────────────
  const { data: outlet } = await supabase
    .from("outlets")
    .select("id, name, address, phone_wa, is_active")
    .eq("slug", outlet_slug)
    .maybeSingle();

  if (!outlet) return json({ error: "Outlet tidak ditemukan" }, 404);
  if (!outlet.is_active) {
    return json({ error: "Outlet sedang tidak menerima pesanan" }, 422);
  }

  // ─── Baca app_settings ───────────────────────────────────────────────────
  const { data: settingsRows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["service_fee_percent", "qris_expire_minutes"]);

  const cfg: Record<string, unknown> = {};
  for (const row of settingsRows ?? []) cfg[row.key] = row.value;

  const feePct = Number(cfg["service_fee_percent"] ?? 0) / 100;
  const expireMin = Number(cfg["qris_expire_minutes"] ?? 15);

  // ─── Server-side reprice — abaikan harga dari client ────────────────────
  const itemIds = [
    ...new Set(
      (items as Record<string, unknown>[])
        .map((i) => i.menu_item_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  if (itemIds.length === 0) {
    return json({ error: "menu_item_id diperlukan di setiap item" }, 400);
  }

  const [{ data: menuItems }, { data: overrideRows }] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name, base_price, is_active")
      .in("id", itemIds),
    supabase
      .from("outlet_menu_overrides")
      .select("menu_item_id, price_override, is_available")
      .eq("outlet_id", outlet.id)
      .in("menu_item_id", itemIds),
  ]);

  const menuMap = Object.fromEntries((menuItems ?? []).map((m) => [m.id, m]));
  const ovMap = Object.fromEntries(
    (overrideRows ?? []).map((o) => [o.menu_item_id, o]),
  );

  // Kumpulkan semua option IDs untuk lookup price_modifier
  const allOptionIds = (items as Record<string, unknown>[])
    .flatMap((i) => (Array.isArray(i.option_ids) ? i.option_ids : []))
    .filter((id): id is string => typeof id === "string");

  const { data: optionRows } =
    allOptionIds.length > 0
      ? await supabase
          .from("menu_variant_options")
          .select("id, name, price_modifier, variant_id")
          .in("id", allOptionIds)
      : { data: [] };

  const optMap = Object.fromEntries((optionRows ?? []).map((o) => [o.id, o]));

  // Validasi & hitung harga tiap item
  let subtotal = 0;
  const validatedItems: Array<{
    menu_item_id: string;
    item_name: string;
    selections: unknown;
    unit_price: number;
    quantity: number;
    subtotal: number;
    note: string | null;
  }> = [];

  for (const item of items as Record<string, unknown>[]) {
    const menuItemId = item.menu_item_id as string;
    const quantity = item.quantity as number;
    const optionIds = (
      Array.isArray(item.option_ids) ? item.option_ids : []
    ) as string[];
    const selections = item.selections ?? {};
    const note = typeof item.note === "string" ? item.note : null;

    if (!menuItemId) return json({ error: "menu_item_id diperlukan" }, 400);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return json({ error: "quantity harus bilangan bulat positif" }, 400);
    }

    const m = menuMap[menuItemId];
    if (!m) return json({ error: `Item tidak ditemukan: ${menuItemId}` }, 422);
    if (!m.is_active) return json({ error: `${m.name} tidak tersedia` }, 422);

    const ov = ovMap[menuItemId];
    if (ov?.is_available === false) {
      return json({ error: `${m.name} tidak tersedia di outlet ini` }, 422);
    }

    const basePrice = Number(ov?.price_override ?? m.base_price);
    const modifiers = optionIds.reduce(
      (sum, id) => sum + Number(optMap[id]?.price_modifier ?? 0),
      0,
    );
    const unitPrice = Math.round(basePrice + modifiers);
    const itemSub = unitPrice * quantity;
    subtotal += itemSub;

    validatedItems.push({
      menu_item_id: menuItemId,
      item_name: m.name,
      selections,
      unit_price: unitPrice,
      quantity,
      subtotal: itemSub,
      note,
    });
  }

  // Biaya layanan — ceiling agar total selalu integer
  const serviceFee = Math.ceil(subtotal * feePct);
  const total = subtotal + serviceFee;

  // ─── Xendit credentials dari Supabase Secrets ─────────────────────────────
  const xenditSecretKey = Deno.env.get("XENDIT_SECRET_KEY");
  if (!xenditSecretKey) {
    console.error("XENDIT_SECRET_KEY belum dikonfigurasi di Supabase Secrets");
    return json(
      { error: "Layanan pembayaran belum tersedia. Hubungi admin." },
      503,
    );
  }

  // ─── Generate reference ID unik ──────────────────────────────────────────
  // reference_id dikirim ke Xendit & disimpan di DB untuk lookup webhook
  const referenceId = `SUKA-${Date.now()}-${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase()}`;

  // Waktu kadaluarsa QR (default 15 menit dari settings)
  const expiredAt = new Date(Date.now() + expireMin * 60 * 1000);

  // ─── Generate order number: [KODE]-DDMMYY-NNN ───────────────────────────
  const outletCode = outlet_slug.split("-")[0].slice(0, 3).toUpperCase();
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // UTC → WIB
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(now.getUTCFullYear()).slice(2);
  const today = `${dd}${mm}${yy}`;

  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      7 * 60 * 60 * 1000,
  ).toISOString();
  const endOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) -
      7 * 60 * 60 * 1000,
  ).toISOString();

  const { count: todayCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("outlet_id", outlet.id)
    .gte("created_at", startOfDay)
    .lt("created_at", endOfDay);

  const seq = String((todayCount ?? 0) + 1).padStart(3, "0");
  const orderNum = `${outletCode}-${today}-${seq}`;

  // ─── INSERT order sebelum call Xendit ────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      outlet_id: outlet.id,
      customer_name: customer_name.trim(),
      customer_wa: waNorm,
      pickup_time: String(pickup_time).trim(),
      notes: notes ? String(notes).trim() : null,
      subtotal,
      service_fee: serviceFee,
      total,
      status: "pending_payment",
      payment_method: "xendit_qris",
      order_number: orderNum,
      tripay_merchant_ref: referenceId, // pakai kolom existing untuk reference_id Xendit
      tripay_reference: null,           // akan diisi dengan xendit payment_request_id
      qris_url: null,                   // akan diisi dengan qr_string dari Xendit
      expires_at: expiredAt.toISOString(),
    })
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    console.error("Gagal insert order:", orderErr);
    return json({ error: "Gagal membuat order. Silakan coba lagi." }, 500);
  }

  // ─── INSERT order_items ───────────────────────────────────────────────────
  const { error: itemsErr } = await supabase
    .from("order_items")
    .insert(validatedItems.map((it) => ({ order_id: order.id, ...it })));

  if (itemsErr) {
    await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancel_reason: "Internal error — gagal simpan item",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    console.error("Gagal insert order_items:", itemsErr);
    return json({ error: "Gagal menyimpan detail order. Silakan coba lagi." }, 500);
  }

  // ─── Call Xendit Payment Request API ─────────────────────────────────────
  // Auth: Basic base64(secret_key + ":") — password kosong
  const xenditAuth = "Basic " + btoa(xenditSecretKey + ":");

  let xenditPaymentRequestId: string | null = null;
  let qrisString: string | null = null;

  try {
    const res = await fetch("https://api.xendit.co/payment_requests", {
      method: "POST",
      headers: {
        Authorization: xenditAuth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference_id: referenceId,
        currency: "IDR",
        amount: total,
        country: "ID",
        payment_method: {
          type: "QR_CODE",
          reusability: "ONE_TIME_USE",
          qr_code: {
            channel_code: "QRIS",
          },
        },
        description: `Order ${orderNum} - SUKA Shawarma ${outlet.name}`,
        metadata: {
          order_id: order.id,
          order_number: orderNum,
          outlet_slug,
        },
      }),
    });

    const payload = await res.json();

    if (!res.ok) {
      throw new Error(
        payload.message ?? payload.error_code ?? `Xendit HTTP ${res.status}`,
      );
    }

    xenditPaymentRequestId = payload.id ?? null;

    // QR string ada di actions[] — cari yang descriptor === "QR_STRING"
    const qrAction = (payload.actions ?? []).find(
      (a: Record<string, string>) => a.descriptor === "QR_STRING",
    );
    qrisString = qrAction?.value ?? null;

    console.info("Xendit payment request dibuat:", {
      payment_request_id: xenditPaymentRequestId,
      order_number: orderNum,
    });
  } catch (err) {
    // Xendit gagal — batalkan order agar tidak menggantung
    await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancel_reason: `Xendit error: ${(err as Error).message}`,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    console.error("Xendit API error:", err);
    return json(
      { error: "Gagal menghubungi layanan pembayaran. Silakan coba lagi." },
      502,
    );
  }

  // ─── UPDATE order dengan data Xendit ─────────────────────────────────────
  await supabase
    .from("orders")
    .update({
      tripay_reference: xenditPaymentRequestId, // payment_request_id Xendit
      qris_url: qrisString,                      // QR string untuk di-render di frontend
    })
    .eq("id", order.id);

  // ─── Trigger notifikasi WA new_order (fire-and-forget) ───────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  fetch(`${supabaseUrl}/functions/v1/send-wa-notifications`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: order.id, event: "new_order" }),
  }).catch((err) => console.error("Gagal trigger WA notif new_order:", err));

  // ─── Response ke frontend ─────────────────────────────────────────────────
  return json({
    success: true,
    order_number: order.order_number,
    order_id: order.id,
    qris_string: qrisString,           // untuk di-render jadi QR code di frontend
    payment_request_id: xenditPaymentRequestId,
    expires_at: expiredAt.toISOString(),
    total,
    subtotal,
    service_fee: serviceFee,
  });
});
