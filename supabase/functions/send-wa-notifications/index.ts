// Edge Function: send-wa-notifications
// Kirim notifikasi WA via Fonnte ke admin, outlet, dan customer saat order masuk/update

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FONNTE_URL = "https://api.fonnte.com/send";

async function kirimWA(token: string, target: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: { "Authorization": token, "Content-Type": "application/json" },
      body: JSON.stringify({ target, message }),
    });
    const json = await res.json();
    return json.status === true;
  } catch {
    return false;
  }
}

function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const FONNTE_TOKEN   = Deno.env.get("FONNTE_TOKEN");
  const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ADMIN_WA       = Deno.env.get("ADMIN_WA_NUMBER"); // nomor WA admin pusat

  if (!FONNTE_TOKEN) {
    return Response.json({ error: "FONNTE_TOKEN tidak dikonfigurasi" }, { status: 500, headers: CORS });
  }

  let body: { order_id: string; event?: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400, headers: CORS });
  }

  const { order_id, event = "new_order" } = body;
  if (!order_id) return Response.json({ error: "order_id wajib diisi" }, { status: 400, headers: CORS });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Ambil data order lengkap
  const { data: order, error } = await db
    .from("orders")
    .select(`
      id, order_number, customer_name, customer_wa, total, status,
      pickup_time, notes, created_at,
      outlets(name, phone_wa),
      order_items(item_name, quantity, unit_price, note)
    `)
    .eq("id", order_id)
    .single();

  console.log("order_id:", order_id);
  console.log("error:", JSON.stringify(error));
  console.log("order:", order ? "found" : "null");

  if (error || !order) {
    return Response.json({ error: "Order tidak ditemukan", detail: error?.message }, { status: 404, headers: CORS });
  }

  const outlet     = (order.outlets as { name: string; phone_wa: string | null }) || {};
  const items      = (order.order_items as { item_name: string; quantity: number; unit_price: number; note?: string }[]) || [];
  const itemsText  = items.map(i =>
    `- ${i.quantity}× ${i.item_name} (${formatRupiah(i.unit_price * i.quantity)})` +
    (i.note ? `\n  📝 ${i.note}` : "")
  ).join("\n");
  const totalText  = formatRupiah(order.total);
  const results: Record<string, boolean> = {};

  if (event === "new_order") {
    // Pesan ke admin pusat
    if (ADMIN_WA) {
      const msgAdmin = `🔔 *ORDER BARU — ${outlet.name}*\n\n` +
        `📋 No: ${order.order_number}\n` +
        `👤 ${order.customer_name} (${order.customer_wa})\n` +
        `⏰ Ambil: ${order.pickup_time || "-"}\n\n` +
        `${itemsText}\n\n` +
        `💰 Total: *${totalText}*` +
        (order.notes ? `\n📝 Catatan: ${order.notes}` : "");
      results.admin = await kirimWA(FONNTE_TOKEN, ADMIN_WA, msgAdmin);
    }

    // Pesan ke outlet
    if (outlet.phone_wa) {
      const msgOutlet = `🔔 *ORDER BARU MASUK!*\n\n` +
        `📋 No: ${order.order_number}\n` +
        `👤 ${order.customer_name}\n` +
        `⏰ Ambil: ${order.pickup_time || "-"}\n\n` +
        `${itemsText}\n\n` +
        `💰 Total: *${totalText}*` +
        (order.notes ? `\n📝 Catatan: ${order.notes}` : "");
      results.outlet = await kirimWA(FONNTE_TOKEN, outlet.phone_wa, msgOutlet);
    }

    // Pesan ke customer
    if (order.customer_wa) {
      const msgCustomer = `✅ *Pesanan Diterima!*\n\n` +
        `Halo ${order.customer_name}! Pesananmu sudah masuk.\n\n` +
        `📋 No: *${order.order_number}*\n` +
        `🏪 Outlet: ${outlet.name}\n` +
        `⏰ Ambil: ${order.pickup_time || "-"}\n\n` +
        `${itemsText}\n\n` +
        `💰 Total: *${totalText}*\n\n` +
        `Segera transfer ke rekening BCA *0955193763* a/n Irsyad Tawakkal, lalu upload bukti transfernya di halaman pesananmu ya! 🙏`;
      results.customer = await kirimWA(FONNTE_TOKEN, order.customer_wa, msgCustomer);
    }

  } else if (event === "ready") {
    // Notif ke customer saat pesanan siap diambil
    if (order.customer_wa) {
      const msgReady = `✅ *Pesananmu Siap Diambil!*\n\n` +
        `Halo ${order.customer_name}!\n` +
        `Pesanan *${order.order_number}* sudah siap di *${outlet.name}*.\n\n` +
        `Silakan segera diambil ya! 🙏`;
      results.customer = await kirimWA(FONNTE_TOKEN, order.customer_wa, msgReady);
    }

  } else if (event === "cancelled") {
    // Notif ke customer saat pesanan dibatalkan
    if (order.customer_wa) {
      const msgCancel = `❌ *Pesanan Dibatalkan*\n\n` +
        `Halo ${order.customer_name},\n` +
        `Pesanan *${order.order_number}* dibatalkan.\n\n` +
        `Hubungi outlet untuk info lebih lanjut.`;
      results.customer = await kirimWA(FONNTE_TOKEN, order.customer_wa, msgCancel);
    }

  } else if (event === "transfer_submitted") {
    // Notif ke admin + outlet saat customer upload bukti transfer
    const msgProof = `💳 *BUKTI TRANSFER MASUK — ${outlet.name}*\n\n` +
      `📋 No: ${order.order_number}\n` +
      `👤 ${order.customer_name} (${order.customer_wa})\n` +
      `💰 Total: *${totalText}*\n\n` +
      `Cek admin panel untuk verifikasi pembayaran.`;
    if (ADMIN_WA) results.admin = await kirimWA(FONNTE_TOKEN, ADMIN_WA, msgProof);
    if (outlet.phone_wa) results.outlet = await kirimWA(FONNTE_TOKEN, outlet.phone_wa, msgProof);

  } else if (event === "transfer_rejected") {
    // Notif ke customer saat bukti transfer ditolak
    if (order.customer_wa) {
      const msgRejected =
        `❌ *Bukti Transfer Ditolak*\n\n` +
        `Halo ${order.customer_name},\n` +
        `Maaf, bukti transfer untuk pesanan *${order.order_number}* tidak dapat diverifikasi.\n\n` +
        `Kemungkinan penyebab:\n` +
        `• Foto buram / tidak terbaca\n` +
        `• Nominal tidak sesuai (${totalText})\n` +
        `• Rekening tujuan salah\n\n` +
        `Silakan buka kembali halaman pesananmu dan upload ulang bukti yang benar 📲`;
      results.customer = await kirimWA(FONNTE_TOKEN, order.customer_wa, msgRejected);
    }

  } else if (event === "transfer_verified") {
    // Notif ke customer — pembayaran dikonfirmasi, pesanan mulai disiapkan
    if (order.customer_wa) {
      const msgVerified =
        `🎉 *Pembayaran Dikonfirmasi!*\n\n` +
        `Halo ${order.customer_name}! Transfer kamu sudah kami terima ✅\n\n` +
        `📋 No: *${order.order_number}*\n` +
        `🏪 Outlet: ${outlet.name}\n` +
        `⏰ Ambil: ${order.pickup_time || "-"}\n\n` +
        `${itemsText}\n\n` +
        `💰 Total: *${totalText}*\n\n` +
        `Pesanan sedang disiapkan. Datang sesuai waktu pickup ya! 🙏`;
      results.customer = await kirimWA(FONNTE_TOKEN, order.customer_wa, msgVerified);
    }
    // Notif ke outlet — mulai siapkan pesanan
    if (outlet.phone_wa) {
      const msgOutletVerified =
        `✅ *PEMBAYARAN TERVERIFIKASI — SIAPKAN PESANAN*\n\n` +
        `📋 No: ${order.order_number}\n` +
        `👤 ${order.customer_name}\n` +
        `⏰ Ambil: ${order.pickup_time || "-"}\n\n` +
        `${itemsText}\n\n` +
        `💰 Total: *${totalText}*` +
        (order.notes ? `\n📝 Catatan: ${order.notes}` : "");
      results.outlet = await kirimWA(FONNTE_TOKEN, outlet.phone_wa, msgOutletVerified);
    }
  }

  // Log notifikasi ke DB
  await db.from("notification_logs").insert({
    order_id,
    event,
    results: JSON.stringify(results),
    sent_at: new Date().toISOString(),
  }).select();

  return Response.json({ ok: true, results }, { headers: CORS });
});
