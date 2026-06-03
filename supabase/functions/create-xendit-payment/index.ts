// Edge Function: create-xendit-payment
// Validasi order, hitung harga server-side, buat payment via Xendit
// Mendukung: QRIS, Virtual Account (BCA/BNI/BRI/MANDIRI), E-Wallet (GOPAY/OVO/DANA)

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

// ─── Konfigurasi channel yang didukung ───────────────────────────────────────
type ChannelType = "QRIS" | "BCA" | "BNI" | "BRI" | "MANDIRI" | "GOPAY" | "OVO" | "DANA";

const CHANNEL_CONFIG: Record<ChannelType, {
  type: "QR_CODE" | "VIRTUAL_ACCOUNT" | "EWALLET";
  paymentMethod: string;   // nilai kolom payment_method di DB
  label: string;           // label tampil ke user
  expireMinutes: number;   // waktu kadaluarsa dalam menit
}> = {
  QRIS:    { type: "QR_CODE",         paymentMethod: "xendit_qris",    label: "QRIS",          expireMinutes: 15  },
  BCA:     { type: "VIRTUAL_ACCOUNT", paymentMethod: "xendit_va",      label: "BCA",           expireMinutes: 1440 }, // 24 jam
  BNI:     { type: "VIRTUAL_ACCOUNT", paymentMethod: "xendit_va",      label: "BNI",           expireMinutes: 1440 },
  BRI:     { type: "VIRTUAL_ACCOUNT", paymentMethod: "xendit_va",      label: "BRI",           expireMinutes: 1440 },
  MANDIRI: { type: "VIRTUAL_ACCOUNT", paymentMethod: "xendit_va",      label: "Mandiri",       expireMinutes: 1440 },
  GOPAY:   { type: "EWALLET",         paymentMethod: "xendit_ewallet", label: "GoPay",         expireMinutes: 15  },
  OVO:     { type: "EWALLET",         paymentMethod: "xendit_ewallet", label: "OVO",           expireMinutes: 15  },
  DANA:    { type: "EWALLET",         paymentMethod: "xendit_ewallet", label: "DANA",          expireMinutes: 15  },
};

// ─── Build payment_method object untuk Xendit ────────────────────────────────
function buildXenditPaymentMethod(
  channel: ChannelType,
  customerName: string,
  expiredAt: Date,
  frontendUrl: string,
  orderNum: string,
): Record<string, unknown> {
  const cfg = CHANNEL_CONFIG[channel];

  if (cfg.type === "QR_CODE") {
    return {
      type: "QR_CODE",
      reusability: "ONE_TIME_USE",
      qr_code: { channel_code: "QRIS" },
    };
  }

  if (cfg.type === "VIRTUAL_ACCOUNT") {
    return {
      type: "VIRTUAL_ACCOUNT",
      reusability: "ONE_TIME_USE",
      virtual_account: {
        channel_code: channel, // BCA/BNI/BRI/MANDIRI
        channel_properties: {
          customer_name: customerName.slice(0, 50), // Xendit max 50 char
          expires_at: expiredAt.toISOString(),
        },
      },
    };
  }

  // EWALLET
  const returnUrl = `${frontendUrl}/order.html?order=${orderNum}`;
  return {
    type: "EWALLET",
    reusability: "ONE_TIME_USE",
    ewallet: {
      channel_code: channel, // GOPAY/OVO/DANA
      channel_properties: {
        success_return_url: returnUrl,
        failure_return_url: returnUrl,
        cancel_return_url:  returnUrl,
      },
    },
  };
}

// ─── Ekstrak data relevan dari response Xendit ────────────────────────────────
function extractPaymentData(payload: Record<string, unknown>, channel: ChannelType): {
  paymentRequestId: string | null;
  qrisString: string | null;
  vaNumber: string | null;
  vaBank: string | null;
  ewalletDeeplink: string | null;
} {
  const paymentRequestId = (payload.id as string) ?? null;
  let qrisString: string | null = null;
  let vaNumber: string | null = null;
  let vaBank: string | null = null;
  let ewalletDeeplink: string | null = null;

  const cfg = CHANNEL_CONFIG[channel];

  // deno-lint-ignore no-explicit-any
  const p = payload as any;
  const actions: any[] = p.actions ?? []; // hoist — dipakai di QR_CODE dan EWALLET

  if (cfg.type === "QR_CODE") {
    const qrAction = actions.find(
      (a) => a.descriptor === "QR_STRING" || a.type === "QR_CODE",
    );
    qrisString = qrAction?.value ??
      p.payment_method?.qr_code?.channel_properties?.qr_string ??
      p.payment_method?.channel_properties?.qr_string ??
      p.qr_string ?? null;
  }

  if (cfg.type === "VIRTUAL_ACCOUNT") {
    const channelProps = p.payment_method?.virtual_account?.channel_properties;
    vaNumber = channelProps?.virtual_account_number ?? channelProps?.account_details ?? null;
    vaBank = channel;
  }

  if (cfg.type === "EWALLET") {
    const redirectAction = actions.find(
      (a) => a.type === "REDIRECT_CUSTOMER" || a.type === "MOBILE_DEEPLINK",
    );
    ewalletDeeplink = redirectAction?.value ?? redirectAction?.mobile_deeplink ?? null;
  }

  return { paymentRequestId, qrisString, vaNumber, vaBank, ewalletDeeplink };
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

  const {
    outlet_slug, items, customer_name, customer_wa, pickup_time, notes,
    payment_channel,  // ← baru: pilihan channel dari customer (default: QRIS)
  } = body as Record<string, unknown>;

  // ─── Validasi & normalisasi payment_channel ──────────────────────────────
  const channel = (
    typeof payment_channel === "string" &&
    Object.keys(CHANNEL_CONFIG).includes(payment_channel.toUpperCase())
      ? payment_channel.toUpperCase()
      : "QRIS"
  ) as ChannelType;

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

  // Gunakan expiry dari CHANNEL_CONFIG, kecuali QRIS bisa override dari settings
  const expireMin = channel === "QRIS"
    ? Number(cfg["qris_expire_minutes"] ?? CHANNEL_CONFIG.QRIS.expireMinutes)
    : CHANNEL_CONFIG[channel].expireMinutes;

  // ─── Server-side reprice ─────────────────────────────────────────────────
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

  // allOptionIds derivable dari request body — tidak perlu tunggu DB queries
  const allOptionIds = (items as Record<string, unknown>[])
    .flatMap((i) => (Array.isArray(i.option_ids) ? i.option_ids : []))
    .filter((id): id is string => typeof id === "string");

  // Semua 3 queries dijalankan paralel
  const [{ data: menuItems }, { data: overrideRows }, { data: optionRows }] =
    await Promise.all([
      supabase
        .from("menu_items")
        .select("id, name, base_price, is_active")
        .in("id", itemIds),
      supabase
        .from("outlet_menu_overrides")
        .select("menu_item_id, price_override, is_available")
        .eq("outlet_id", outlet.id)
        .in("menu_item_id", itemIds),
      allOptionIds.length > 0
        ? supabase
            .from("menu_variant_options")
            .select("id, name, price_modifier, variant_id")
            .in("id", allOptionIds)
        : Promise.resolve({ data: [] }),
    ]);

  const menuMap = Object.fromEntries((menuItems ?? []).map((m) => [m.id, m]));
  const ovMap = Object.fromEntries(
    (overrideRows ?? []).map((o) => [o.menu_item_id, o]),
  );

  const optMap = Object.fromEntries((optionRows ?? []).map((o) => [o.id, o]));

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
    const optionIds = (Array.isArray(item.option_ids) ? item.option_ids : []) as string[];
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

  const serviceFee = Math.ceil(subtotal * feePct);
  const total = subtotal + serviceFee;

  // ─── Xendit credentials ───────────────────────────────────────────────────
  const xenditSecretKey = Deno.env.get("XENDIT_SECRET_KEY");
  if (!xenditSecretKey) {
    console.error("XENDIT_SECRET_KEY belum dikonfigurasi");
    return json({ error: "Layanan pembayaran belum tersedia. Hubungi admin." }, 503);
  }

  const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "https://order.sukshawarma.com";

  // ─── Generate reference ID & order number ────────────────────────────────
  const referenceId = `SUKA-${Date.now()}-${crypto
    .randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  const expiredAt = new Date(Date.now() + expireMin * 60 * 1000);

  const outletCode = outlet_slug.split("-")[0].slice(0, 3).toUpperCase();
  const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const dd = String(nowWib.getUTCDate()).padStart(2, "0");
  const mo = String(nowWib.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(nowWib.getUTCFullYear()).slice(2);

  const startOfDay = new Date(
    Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate()) - 7 * 3600000,
  ).toISOString();
  const endOfDay = new Date(
    Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate() + 1) - 7 * 3600000,
  ).toISOString();

  const { count: todayCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("outlet_id", outlet.id)
    .gte("created_at", startOfDay)
    .lt("created_at", endOfDay);

  const seq = String((todayCount ?? 0) + 1).padStart(3, "0");
  const orderNum = `${outletCode}-${dd}${mo}${yy}-${seq}`;

  // ─── INSERT order ─────────────────────────────────────────────────────────
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
      payment_method: CHANNEL_CONFIG[channel].paymentMethod,
      payment_channel: channel,
      order_number: orderNum,
      tripay_merchant_ref: referenceId,
      tripay_reference: null,
      qris_url: null,
      va_number: null,
      va_bank: null,
      ewallet_deeplink: null,
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
    await supabase.from("orders").update({
      status: "cancelled",
      cancel_reason: "Internal error — gagal simpan item",
      cancelled_at: new Date().toISOString(),
    }).eq("id", order.id);
    console.error("Gagal insert order_items:", itemsErr);
    return json({ error: "Gagal menyimpan detail order. Silakan coba lagi." }, 500);
  }

  // ─── Call Xendit Payment Request API ─────────────────────────────────────
  const xenditAuth = "Basic " + btoa(xenditSecretKey + ":");
  const xenditPaymentMethod = buildXenditPaymentMethod(
    channel, customer_name.trim(), expiredAt, frontendUrl, orderNum,
  );

  let xenditResponse: Record<string, unknown> | null = null;

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
        payment_method: xenditPaymentMethod,
        description: `Order ${orderNum} - SUKA Shawarma ${outlet.name}`,
        metadata: {
          order_id: order.id,
          order_number: orderNum,
          outlet_slug,
          payment_channel: channel,
        },
      }),
    });

    xenditResponse = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      throw new Error(
        (xenditResponse.message as string) ??
        (xenditResponse.error_code as string) ??
        `Xendit HTTP ${res.status}`,
      );
    }

    console.info("Xendit response:", JSON.stringify({
      id: xenditResponse.id,
      status: xenditResponse.status,
      channel,
      actions: xenditResponse.actions,
    }));
  } catch (err) {
    await supabase.from("orders").update({
      status: "cancelled",
      cancel_reason: `Xendit error: ${(err as Error).message}`,
      cancelled_at: new Date().toISOString(),
    }).eq("id", order.id);
    console.error("Xendit API error:", err);
    return json({ error: "Gagal menghubungi layanan pembayaran. Silakan coba lagi." }, 502);
  }

  // ─── Ekstrak data dari response Xendit ───────────────────────────────────
  const { paymentRequestId, qrisString, vaNumber, vaBank, ewalletDeeplink } =
    extractPaymentData(xenditResponse, channel);

  // ─── UPDATE order dengan data payment ────────────────────────────────────
  await supabase.from("orders").update({
    tripay_reference: paymentRequestId,
    qris_url: qrisString,
    va_number: vaNumber,
    va_bank: vaBank,
    ewallet_deeplink: ewalletDeeplink,
  }).eq("id", order.id);

  // ─── Trigger WA notif new_order (fire-and-forget) ────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  fetch(`${supabaseUrl}/functions/v1/send-wa-notifications`, {
    method: "POST",
    headers: { Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: order.id, event: "new_order" }),
  }).catch((err) => console.error("Gagal trigger WA notif:", err));

  // ─── Response ke frontend ─────────────────────────────────────────────────
  return json({
    success: true,
    order_number: order.order_number,
    order_id: order.id,
    payment_channel: channel,
    payment_method: CHANNEL_CONFIG[channel].paymentMethod, // langsung pakai di frontend
    payment_type: CHANNEL_CONFIG[channel].type,
    // QRIS
    qris_string: qrisString,
    // Virtual Account
    va_number: vaNumber,
    va_bank: vaBank,
    // E-Wallet
    ewallet_deeplink: ewalletDeeplink,
    // Common
    payment_request_id: paymentRequestId,
    expires_at: expiredAt.toISOString(),
    total,
    subtotal,
    service_fee: serviceFee,
  });
});
