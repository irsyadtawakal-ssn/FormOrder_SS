// Edge Function: xendit-webhook
// Menerima callback Xendit, verifikasi x-callback-token, update status order
// Mendukung: QRIS, Virtual Account (BCA/BNI/BRI/MANDIRI), E-Wallet (GOPAY/OVO/DANA)
// Semua channel menggunakan event payment.capture / payment.failure yang sama

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Perbandingan constant-time untuk cegah timing attack pada token comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Xendit hanya kirim POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ─── Verifikasi x-callback-token ─────────────────────────────────────────
  // Xendit mengirim token statis di header x-callback-token
  // Token ini sama dengan XENDIT_CALLBACK_TOKEN di Supabase Secrets
  const incomingToken = req.headers.get("x-callback-token") ?? "";

  const callbackToken = Deno.env.get("XENDIT_CALLBACK_TOKEN");
  if (!callbackToken) {
    console.error("XENDIT_CALLBACK_TOKEN belum dikonfigurasi di Supabase Secrets");
    return new Response("Internal error", { status: 500 });
  }

  if (!incomingToken || !timingSafeEqual(incomingToken, callbackToken)) {
    console.error("Token webhook Xendit tidak valid — kemungkinan bukan dari Xendit");
    return new Response("Forbidden", { status: 403 });
  }

  // ─── Parse payload ────────────────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = String(payload.event ?? "");
  const data = payload.data as Record<string, unknown> | undefined;

  if (!event || !data) {
    return new Response("Payload tidak lengkap", { status: 400 });
  }

  console.log("Xendit webhook payload:", JSON.stringify(payload, null, 2));

  console.info("Xendit webhook diterima:", {
    event,
    reference_id: data.reference_id,
    channel_code: data.channel_code,
    payment_method_type: data.type,
  });

  // ─── Hanya proses event payment yang relevan ─────────────────────────────
  // payment.capture / payment.succeeded → pembayaran berhasil
  // payment.failure / payment.failed → pembayaran gagal
  const isSuccess = event === "payment.capture" || event === "payment.succeeded";
  const isFailure = event === "payment.failure" || event === "payment.failed";

  if (!isSuccess && !isFailure) {
    console.info(`Event '${event}' diabaikan`);
    return jsonOk({ success: true, message: `Event '${event}' diabaikan` });
  }

  const paymentId = String(data.payment_id ?? data.id ?? "");  // untuk idempotency
  const referenceId = String(data.reference_id ?? "");          // reference_id Xendit
  const paymentRequestId = String(data.payment_request_id ?? ""); // pr-... yang kita simpan
  const status = String(data.status ?? "").toUpperCase();
  const requestAmount = Number(data.amount ?? data.request_amount ?? 0);

  // Ambil order_id dari metadata yang kita set saat create payment
  const metadata = data.metadata as Record<string, unknown> | undefined;
  const orderIdFromMeta = String(metadata?.order_id ?? "");

  console.info("Lookup order:", { referenceId, paymentRequestId, orderIdFromMeta });

  if (!referenceId && !paymentRequestId && !orderIdFromMeta) {
    console.error("Tidak ada identifier order di payload Xendit");
    return new Response("Payload tidak lengkap", { status: 400 });
  }

  // ─── Init Supabase dengan service role key ────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ─── Cari order dengan beberapa fallback strategy ─────────────────────────
  // 1. metadata.order_id → lookup by id (paling reliable)
  // 2. payment_request_id → lookup by tripay_reference (pr-xxx dari Xendit)
  // 3. reference_id → lookup by tripay_merchant_ref (SUKA-... format)
  let order: { id: string; order_number: string; status: string; total: number; outlet_id: string; customer_name: string; customer_wa: string } | null = null;

  if (orderIdFromMeta) {
    const { data: o } = await supabase.from("orders")
      .select("id, order_number, status, total, outlet_id, customer_name, customer_wa")
      .eq("id", orderIdFromMeta).maybeSingle();
    order = o;
  }

  if (!order && paymentRequestId) {
    const { data: o } = await supabase.from("orders")
      .select("id, order_number, status, total, outlet_id, customer_name, customer_wa")
      .eq("tripay_reference", paymentRequestId).maybeSingle();
    order = o;
  }

  if (!order && referenceId) {
    const { data: o } = await supabase.from("orders")
      .select("id, order_number, status, total, outlet_id, customer_name, customer_wa")
      .eq("tripay_merchant_ref", referenceId).maybeSingle();
    order = o;
  }

  if (!order) {
    console.error("Order tidak ditemukan:", { referenceId, paymentRequestId, orderIdFromMeta });
    return jsonOk({ success: false, message: "Order tidak ditemukan" });
  }

  // ─── Handle payment failure ───────────────────────────────────────────────
  if (isFailure) {
    if (order.status === "pending_payment") {
      await supabase
        .from("orders")
        .update({
          status: "cancelled",
          cancel_reason: `Pembayaran gagal (Xendit: ${data.failure_code ?? "UNKNOWN"})`,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending_payment");

      console.info("Order dibatalkan karena payment.failure:", order.order_number);
    }
    return jsonOk({ success: true, message: "Order failure diproses" });
  }

  // ─── Handle payment success (payment.capture / payment.succeeded) ──────────

  // Hanya proses jika status SUCCEEDED atau PAID (payment.succeeded bisa kirim "PAID")
  if (status !== "SUCCEEDED" && status !== "PAID") {
    console.info("Status bukan SUCCEEDED/PAID — diabaikan:", status);
    return jsonOk({ success: true, message: `Status '${status}' diabaikan` });
  }

  // Idempotency check — cek apakah sudah pernah diproses dengan payment_id ini
  if (order.status === "paid") {
    console.info("Order sudah paid sebelumnya (idempoten):", order.order_number);
    return jsonOk({ success: true, message: "Sudah diproses sebelumnya (idempoten)" });
  }

  // Guard: jangan proses order yang bukan pending_payment
  if (order.status !== "pending_payment") {
    console.warn("Order status tidak valid untuk diupdate ke paid:", {
      order_number: order.order_number,
      current_status: order.status,
    });
    return jsonOk({
      success: false,
      message: `Order status '${order.status}' tidak bisa diupdate ke paid`,
    });
  }

  // ─── Amount verification — cegah underpayment/fraud ──────────────────────
  if (requestAmount !== Number(order.total)) {
    console.error("Amount mismatch — TIDAK diproses:", {
      order_number: order.order_number,
      expected: order.total,
      received: requestAmount,
    });
    // Return 200 agar Xendit tidak retry
    return jsonOk({
      success: false,
      message: "Amount tidak sesuai — order tidak diupdate",
    });
  }

  // ─── UPDATE order status → paid ──────────────────────────────────────────
  // Guard .eq("status", "pending_payment") cegah race condition jika webhook duplikat
  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      // Simpan payment_id Xendit untuk audit/idempotency
      tripay_reference: paymentId || (order as Record<string, unknown>).tripay_reference,
    })
    .eq("id", order.id)
    .eq("status", "pending_payment");

  if (updateErr) {
    console.error("Gagal update order ke paid:", updateErr);
    // Return 500 agar Xendit retry
    return new Response("Internal error", { status: 500 });
  }

  console.info("Order berhasil diupdate ke paid:", order.order_number);

  // ─── Trigger send-wa-notifications (async, fire-and-forget) ──────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  fetch(`${supabaseUrl}/functions/v1/send-wa-notifications`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: order.id, event: "paid" }),
  }).catch((err) => console.error("Gagal trigger send-wa-notifications:", err));

  return jsonOk({ success: true, message: "Order diupdate ke paid" });
});
