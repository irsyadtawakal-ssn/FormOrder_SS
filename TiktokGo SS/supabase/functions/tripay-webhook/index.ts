// Edge Function: tripay-webhook
// Menerima callback Tripay, verifikasi signature, update status order

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

// Perbandingan constant-time untuk cegah timing attack
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
  // Tripay hanya POST, tapi tolak semua method lain dengan baik
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Baca raw body dulu sebelum apapun — diperlukan untuk signature verification
  const rawBody = await req.text();

  // ─── Verifikasi signature HMAC-SHA256 ────────────────────────────────────
  // Tripay mengirim signature di header X-Callback-Signature
  // Signature = HMAC-SHA256(raw_json_body, private_key)
  const callbackSig = req.headers.get("x-callback-signature") ?? "";

  const privateKey = Deno.env.get("TRIPAY_PRIVATE_KEY");
  if (!privateKey) {
    console.error("TRIPAY_PRIVATE_KEY tidak dikonfigurasi");
    return new Response("Internal error", { status: 500 });
  }

  const expectedSig = await hmacSha256(privateKey, rawBody);

  if (!callbackSig || !timingSafeEqual(expectedSig, callbackSig)) {
    console.error("Signature webhook tidak valid", {
      received: callbackSig,
      expected: expectedSig,
    });
    return new Response("Forbidden", { status: 403 });
  }

  // ─── Parse payload ────────────────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const merchantRef = String(payload.merchant_ref ?? "");
  const reference = String(payload.reference ?? "");
  const status = String(payload.status ?? "");
  const totalAmount = Number(payload.total_amount ?? 0);

  if (!merchantRef || !status) {
    return new Response("Payload tidak lengkap", { status: 400 });
  }

  // ─── Hanya proses PAID dan EXPIRED dari Tripay ────────────────────────────
  // Status lain (FAILED, REFUND) tidak ada aksi di sistem ini
  if (status !== "PAID" && status !== "EXPIRED") {
    return jsonOk({ success: true, message: `Status ${status} diabaikan` });
  }

  // ─── Init Supabase service role ───────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ─── Cari order by merchant_ref ───────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total, outlet_id, customer_name, customer_wa",
    )
    .eq("tripay_merchant_ref", merchantRef)
    .maybeSingle();

  if (orderErr || !order) {
    console.error("Order tidak ditemukan:", { merchantRef, orderErr });
    // Return 200 agar Tripay tidak retry — order mungkin sudah dihapus/tidak valid
    return jsonOk({ success: false, message: "Order tidak ditemukan" });
  }

  // ─── Handle EXPIRED ───────────────────────────────────────────────────────
  if (status === "EXPIRED") {
    // Hanya update jika masih pending (belum dibayar)
    if (order.status === "pending_payment") {
      await supabase
        .from("orders")
        .update({
          status: "expired",
          cancel_reason: "Pembayaran expired (Tripay)",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending_payment");

      console.info("Order expired via Tripay webhook:", order.order_number);
    }
    return jsonOk({ success: true, message: "Order expired diupdate" });
  }

  // ─── Handle PAID ──────────────────────────────────────────────────────────

  // Idempotency check — kalau sudah paid, return 200 tanpa proses ulang
  if (order.status === "paid") {
    return jsonOk({ success: true, message: "Sudah diproses sebelumnya (idempoten)" });
  }

  // Guard: jangan proses order yang statusnya bukan pending_payment
  // (bisa cancelled/expired duluan oleh pg_cron)
  if (order.status !== "pending_payment") {
    console.warn("Order status tidak valid untuk PAID:", {
      order_number: order.order_number,
      status: order.status,
    });
    return jsonOk({
      success: false,
      message: `Order status '${order.status}' tidak bisa diupdate ke paid`,
    });
  }

  // ─── Amount verification — cegah underpayment/fraud ──────────────────────
  if (totalAmount !== Number(order.total)) {
    console.error("Amount mismatch — TIDAK diproses", {
      order_number: order.order_number,
      expected: order.total,
      received: totalAmount,
    });
    // Return 200 agar Tripay tidak retry, tapi tandai sebagai gagal
    return jsonOk({
      success: false,
      message: "Amount tidak sesuai — order tidak diupdate",
    });
  }

  // ─── UPDATE order status → paid ───────────────────────────────────────────
  // Guard tambahan: .eq("status", "pending_payment") cegah race condition
  // jika dua webhook tiba bersamaan
  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      status: "paid",
      tripay_reference: reference,
      paid_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "pending_payment");

  if (updateErr) {
    console.error("Gagal update order ke paid:", updateErr);
    // Return 500 agar Tripay retry
    return new Response("Internal error", { status: 500 });
  }

  console.info("Order berhasil diupdate ke paid:", order.order_number);

  // ─── Trigger send-wa-notifications (async, fire-and-forget) ──────────────
  // Tidak await agar webhook response cepat ke Tripay
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  fetch(`${supabaseUrl}/functions/v1/send-wa-notifications`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: order.id, event: "paid" }),
  }).catch((err) =>
    console.error("Gagal trigger send-wa-notifications:", err),
  );

  return jsonOk({ success: true, message: "Order diupdate ke paid" });
});
