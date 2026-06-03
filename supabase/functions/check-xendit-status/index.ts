// Edge Function: check-xendit-status
// Fallback polling — customer tap "Cek Status Pembayaran"
// Cek status ke Xendit API jika webhook belum datang, sync ke DB jika perlu

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Rate Limiter (5 req/menit per IP) ───────────────────────────────────────
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
    return json({ error: "Terlalu banyak permintaan. Tunggu sebentar." }, 429);
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
      "id, order_number, status, total, tripay_reference, expires_at",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (orderErr || !order) {
    return json({ error: "Order tidak ditemukan" }, 404);
  }

  // Kalau order sudah final, kembalikan status DB tanpa tanya Xendit
  const finalStatuses = ["paid", "preparing", "ready", "done", "cancelled", "expired"];
  if (finalStatuses.includes(order.status)) {
    return json({ success: true, status: order.status, synced: false });
  }

  // ─── Cek waktu kadaluarsa lokal ───────────────────────────────────────────
  if (order.status === "pending_payment" && new Date(order.expires_at) < new Date()) {
    await supabase
      .from("orders")
      .update({
        status: "expired",
        cancel_reason: "Pembayaran expired (timeout lokal)",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending_payment");

    return json({ success: true, status: "expired", synced: true });
  }

  // ─── Butuh payment_request_id Xendit untuk cek ke API ────────────────────
  // tripay_reference menyimpan xendit payment_request_id (pr-xxx)
  if (!order.tripay_reference) {
    return json({
      success: true,
      status: order.status,
      synced: false,
      message: "Payment request Xendit belum terbuat. Coba buat ulang order.",
    });
  }

  // ─── Xendit credentials ───────────────────────────────────────────────────
  const xenditSecretKey = Deno.env.get("XENDIT_SECRET_KEY");
  if (!xenditSecretKey) {
    console.error("XENDIT_SECRET_KEY belum dikonfigurasi");
    return json({ error: "Layanan pembayaran tidak tersedia" }, 503);
  }

  const xenditAuth = "Basic " + btoa(xenditSecretKey + ":");

  // ─── GET /payment_requests/{id} dari Xendit ───────────────────────────────
  let xenditStatus: string | null = null;
  let xenditAmount: number | null = null;

  try {
    const res = await fetch(
      `https://api.xendit.co/payment_requests/${order.tripay_reference}`,
      {
        method: "GET",
        headers: { Authorization: xenditAuth },
      },
    );

    const payload = await res.json();

    if (!res.ok) {
      console.error("Xendit check-status error:", payload.message ?? payload.error_code);
      // Kembalikan status DB — jangan error ke customer
      return json({ success: true, status: order.status, synced: false });
    }

    xenditStatus = String(payload.status ?? "").toUpperCase();
    xenditAmount = Number(payload.amount ?? 0);

    console.info("Xendit status check:", {
      order_number: orderNumber,
      xendit_status: xenditStatus,
      xendit_amount: xenditAmount,
    });
  } catch (err) {
    console.error("Xendit API tidak terjangkau:", err);
    return json({ success: true, status: order.status, synced: false });
  }

  // ─── Sync status dari Xendit ke DB ───────────────────────────────────────

  if (xenditStatus === "SUCCEEDED") {
    // Verifikasi amount sebelum update
    if (xenditAmount !== Number(order.total)) {
      console.error("Amount mismatch di check-xendit-status:", {
        order_number: order.order_number,
        expected: order.total,
        received: xenditAmount,
      });
      return json({
        success: false,
        status: order.status,
        synced: false,
        error: "Jumlah pembayaran tidak sesuai",
      });
    }

    // Update ke paid — guard cegah race condition dengan webhook
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending_payment");

    if (!updateErr) {
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

  if (xenditStatus === "FAILED") {
    await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancel_reason: "Pembayaran gagal (Xendit)",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending_payment");

    return json({ success: true, status: "cancelled", synced: true });
  }

  // Status lain (PENDING, REQUIRES_ACTION, dll) — kembalikan status DB
  return json({ success: true, status: order.status, synced: false });
});
