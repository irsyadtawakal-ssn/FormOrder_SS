// Edge Function: check-tripay-status
// Fallback polling — customer tap "Sudah Bayar? Cek Status"
// Cek status ke Tripay API jika webhook belum datang, sync ke DB jika perlu

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── HMAC-SHA256 via Web Crypto ───────────────────────────────────────────────
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

// ─── Rate Limiter (5 req/menit per IP — lebih ketat dari create) ─────────────
const rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 5) return false;
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

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRate(ip)) {
    return json(
      { error: "Terlalu banyak permintaan. Tunggu sebentar." },
      429,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body tidak valid" }, 400);
  }

  const orderNumber = String(body.order_number ?? "").trim();
  if (!orderNumber) {
    return json({ error: "order_number diperlukan" }, 400);
  }

  // ─── Init Supabase service role ───────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ─── Cari order di DB ─────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total, tripay_reference, tripay_merchant_ref, expires_at",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (orderErr || !order) {
    return json({ error: "Order tidak ditemukan" }, 404);
  }

  // Kalau order sudah final, kembalikan status DB tanpa perlu tanya Tripay
  const finalStatuses = ["paid", "preparing", "ready", "done", "cancelled", "expired"];
  if (finalStatuses.includes(order.status)) {
    return json({ success: true, status: order.status, synced: false });
  }

  // ─── Cek apakah QR sudah expired (sebelum tanya Tripay) ──────────────────
  if (order.status === "pending_payment" && new Date(order.expires_at) < new Date()) {
    // Sudah expired secara waktu — update DB tanpa perlu tanya Tripay
    await supabase
      .from("orders")
      .update({
        status: "expired",
        cancel_reason: "QRIS expired (timeout lokal)",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending_payment");

    return json({ success: true, status: "expired", synced: true });
  }

  // ─── Tripay credentials ───────────────────────────────────────────────────
  const tripayApiKey = Deno.env.get("TRIPAY_API_KEY");
  const tripayPrivateKey = Deno.env.get("TRIPAY_PRIVATE_KEY");
  const tripayMerchantCode = Deno.env.get("TRIPAY_MERCHANT_CODE");
  const tripayBaseUrl =
    Deno.env.get("TRIPAY_BASE_URL") ?? "https://tripay.co.id/api-sandbox";

  if (!tripayApiKey || !tripayPrivateKey || !tripayMerchantCode) {
    console.error("Tripay secrets belum dikonfigurasi");
    return json({ error: "Layanan pembayaran tidak tersedia" }, 503);
  }

  // Butuh tripay_reference untuk cek status ke Tripay
  if (!order.tripay_reference) {
    // Reference belum ada artinya create-tripay-payment belum selesai atau gagal
    return json({
      success: true,
      status: order.status,
      synced: false,
      message: "Transaksi Tripay belum terbuat. Coba buat ulang order.",
    });
  }

  // ─── Signature untuk GET /transaction/detail ──────────────────────────────
  // Tripay: HMAC-SHA256(api_key + merchant_code + reference, private_key)
  const detailSig = await hmacSha256(
    tripayPrivateKey,
    `${tripayApiKey}${tripayMerchantCode}${order.tripay_reference}`,
  );

  // ─── Call Tripay API — cek status transaksi ───────────────────────────────
  let tripayStatus: string | null = null;
  let tripayAmount: number | null = null;

  try {
    const url = new URL(`${tripayBaseUrl}/transaction/detail`);
    url.searchParams.set("reference", order.tripay_reference);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tripayApiKey}`,
        // Beberapa versi Tripay API minta signature di header
        "X-Signature": detailSig,
      },
    });

    const payload = await res.json();

    if (!payload.success) {
      console.error("Tripay detail error:", payload.message);
      // Kembalikan status DB — jangan error ke customer
      return json({ success: true, status: order.status, synced: false });
    }

    tripayStatus = String(payload.data?.status ?? "").toUpperCase();
    tripayAmount = Number(payload.data?.total_amount ?? 0);
  } catch (err) {
    console.error("Tripay API tidak terjangkau:", err);
    return json({ success: true, status: order.status, synced: false });
  }

  // ─── Sync status dari Tripay ke DB jika berbeda ───────────────────────────

  if (tripayStatus === "PAID") {
    // Verifikasi amount sebelum update (sama dengan logika webhook)
    if (tripayAmount !== Number(order.total)) {
      console.error("Amount mismatch di check-status:", {
        order_number: order.order_number,
        expected: order.total,
        received: tripayAmount,
      });
      return json({
        success: false,
        status: order.status,
        synced: false,
        error: "Jumlah pembayaran tidak sesuai",
      });
    }

    // Update ke paid — guard .eq("status") cegah race condition dengan webhook
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending_payment");

    if (updateErr) {
      console.error("Gagal sync paid dari Tripay:", updateErr);
    } else {
      // Trigger WA notif (fire-and-forget) — mungkin belum dikirim oleh webhook
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${supabaseUrl}/functions/v1/send-wa-notifications`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order_id: order.id, event: "paid" }),
      }).catch((err) => console.error("Gagal trigger WA notif:", err));
    }

    return json({ success: true, status: "paid", synced: true });
  }

  if (tripayStatus === "EXPIRED") {
    await supabase
      .from("orders")
      .update({
        status: "expired",
        cancel_reason: "Pembayaran expired (Tripay)",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending_payment");

    return json({ success: true, status: "expired", synced: true });
  }

  // Status lain (UNPAID, dll) — kembalikan status DB tanpa perubahan
  return json({ success: true, status: order.status, synced: false });
});
