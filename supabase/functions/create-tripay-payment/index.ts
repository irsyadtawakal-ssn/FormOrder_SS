// Edge Function: create-tripay-payment
// Validasi order, hitung harga server-side, buat transaksi QRIS via Tripay

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

// ─── HMAC-SHA256 via Web Crypto (built-in Deno, tanpa dependency) ─────────────
async function hmacSha256(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  // Rate limit per IP (dari header proxy Supabase / Cloudflare)
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

  // ─── Init Supabase service role (bypass RLS untuk operasi server) ────────
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

  const feePct = Number(cfg["service_fee_percent"] ?? 0.7) / 100;
  const expireMin = Number(cfg["qris_expire_minutes"] ?? 15);

  // ─── Server-side reprice — abaikan harga dari client ────────────────────
  const itemIds = [
    ...new Set(
      items
        .map((i: Record<string, unknown>) => i.menu_item_id)
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
  const allOptionIds = items
    .flatMap((i: Record<string, unknown>) =>
      Array.isArray(i.option_ids) ? i.option_ids : [],
    )
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
      return json(
        { error: "quantity harus bilangan bulat positif" },
        400,
      );
    }

    const m = menuMap[menuItemId];
    if (!m) {
      return json({ error: `Item tidak ditemukan: ${menuItemId}` }, 422);
    }
    if (!m.is_active) {
      return json({ error: `${m.name} tidak tersedia` }, 422);
    }

    const ov = ovMap[menuItemId];
    if (ov?.is_available === false) {
      return json(
        { error: `${m.name} tidak tersedia di outlet ini` },
        422,
      );
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
      selections,     // snapshot pilihan varian (untuk display di admin/notif)
      unit_price: unitPrice,
      quantity,
      subtotal: itemSub,
      note,
    });
  }

  // Biaya layanan — ceiling agar total selalu integer
  const serviceFee = Math.ceil(subtotal * feePct);
  const total = subtotal + serviceFee;

  // ─── Tripay credentials dari Supabase Secrets ────────────────────────────
  const tripayApiKey = Deno.env.get("TRIPAY_API_KEY");
  const tripayPrivateKey = Deno.env.get("TRIPAY_PRIVATE_KEY");
  const tripayMerchantCode = Deno.env.get("TRIPAY_MERCHANT_CODE");
  const tripayBaseUrl =
    Deno.env.get("TRIPAY_BASE_URL") ?? "https://tripay.co.id/api-sandbox";
  const frontendUrl =
    Deno.env.get("FRONTEND_URL") ?? "https://order.sukshawarma.com";

  if (!tripayApiKey || !tripayPrivateKey || !tripayMerchantCode) {
    console.error("Tripay secrets belum dikonfigurasi");
    return json(
      { error: "Layanan pembayaran belum tersedia. Hubungi admin." },
      503,
    );
  }

  // ─── Generate merchant ref & Tripay signature ─────────────────────────────
  // Merchant ref: unik, dipakai sebagai idempotency key di webhook
  const merchantRef = `SUKA-${Date.now()}-${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase()}`;

  const expiredAt = new Date(Date.now() + expireMin * 60 * 1000);

  // Tripay signature: HMAC-SHA256(merchant_code + merchant_ref + amount, private_key)
  const signature = await hmacSha256(
    tripayPrivateKey,
    `${tripayMerchantCode}${merchantRef}${total}`,
  );

  // ─── INSERT order (sebelum call Tripay agar merchant_ref sudah ada di DB) ─
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
      payment_method: "tripay_qris",
      tripay_merchant_ref: merchantRef,
      tripay_reference: null,
      tripay_pay_url: null,
      qris_url: null,
      expires_at: expiredAt.toISOString(),
    })
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    console.error("Gagal insert order:", orderErr);
    return json({ error: "Gagal membuat order. Silakan coba lagi." }, 500);
  }

  // ─── INSERT order_items (snapshot harga saat order dibuat) ───────────────
  const { error: itemsErr } = await supabase
    .from("order_items")
    .insert(validatedItems.map((it) => ({ order_id: order.id, ...it })));

  if (itemsErr) {
    // Rollback best-effort — order akan di-expired oleh pg_cron jika dibiarkan
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

  // ─── Call Tripay API ──────────────────────────────────────────────────────
  // Items untuk Tripay: tiap item + biaya layanan sebagai line item terpisah
  const tripayOrderItems = [
    ...validatedItems.map((it) => ({
      name: it.item_name,
      price: it.unit_price,     // harus integer Rupiah
      quantity: it.quantity,
    })),
    ...(serviceFee > 0
      ? [{ name: "Biaya Layanan", price: serviceFee, quantity: 1 }]
      : []),
  ];

  let tripayRef: string | null = null;
  let qrisUrl: string | null = null;
  let payUrl: string | null = null;

  try {
    const res = await fetch(`${tripayBaseUrl}/transaction/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tripayApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "QRIS",
        merchant_ref: merchantRef,
        amount: total,
        customer_name: customer_name.trim(),
        customer_email: `order.${order.id.slice(0, 8)}@sukshawarma.com`,
        customer_phone: waNorm,
        order_items: tripayOrderItems,
        return_url: `${frontendUrl}/order/${order.order_number}`,
        expired_time: Math.floor(expiredAt.getTime() / 1000), // Unix timestamp
        signature,
      }),
    });

    const payload = await res.json();

    if (!payload.success) {
      throw new Error(payload.message ?? `Tripay HTTP ${res.status}`);
    }

    tripayRef = payload.data?.reference ?? null;
    // qr_url = URL gambar QR; qr_string = string QRIS mentah (fallback)
    qrisUrl = payload.data?.qr_url ?? payload.data?.qr_string ?? null;
    payUrl = payload.data?.checkout_url ?? payload.data?.pay_url ?? null;
  } catch (err) {
    // Tripay gagal — tandai order cancelled agar tidak menggantung
    await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancel_reason: `Tripay error: ${(err as Error).message}`,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    console.error("Tripay API error:", err);
    return json(
      { error: "Gagal menghubungi layanan pembayaran. Silakan coba lagi." },
      502,
    );
  }

  // ─── UPDATE order dengan data Tripay ─────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      tripay_reference: tripayRef,
      tripay_pay_url: payUrl,
      qris_url: qrisUrl,
    })
    .eq("id", order.id);

  if (updateErr) {
    // Tidak fatal — order valid, customer tetap bisa bayar via pay_url
    console.error("Gagal update tripay data ke order:", updateErr);
  }

  // ─── Response ke frontend ─────────────────────────────────────────────────
  return json({
    success: true,
    order_number: order.order_number,
    order_id: order.id,
    qris_url: qrisUrl,
    pay_url: payUrl,
    expires_at: expiredAt.toISOString(),
    total,
    subtotal,
    service_fee: serviceFee,
  });
});
