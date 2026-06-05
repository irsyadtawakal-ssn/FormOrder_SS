// Edge Function: on-order-done
// Dipanggil saat order status → done
// 1. Upsert customer (wa_number, nama, stats)
// 2. Cek milestone loyalty
// 3. Generate voucher jika milestone tercapai + belum ada voucher aktif
// 4. Kirim WA notif jika loyalty_notif_auto = true

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
  } catch { return false; }
}

function generateVoucherCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SS";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FONNTE_TOKEN = Deno.env.get("FONNTE_TOKEN");
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { order_id: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400, headers: CORS });
  }

  const { order_id } = body;
  if (!order_id) return Response.json({ error: "order_id wajib" }, { status: 400, headers: CORS });

  // ── Ambil order ──────────────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, customer_name, customer_wa, total, status, outlets(name)")
    .eq("id", order_id)
    .single();

  if (orderErr || !order || order.status !== "done") {
    return Response.json({ error: "Order tidak valid atau belum done" }, { status: 400, headers: CORS });
  }

  // ── Cek loyalty aktif ─────────────────────────────────────────────────────────
  const { data: settingsRows } = await db
    .from("app_settings")
    .select("key, value")
    .like("key", "loyalty%");

  const settings: Record<string, string> = {};
  (settingsRows || []).forEach((r: { key: string; value: string }) => {
    settings[r.key] = r.value;
  });

  if (settings["loyalty_enabled"] !== "true") {
    // Catat heartbeat — bukti cron masih hidup (best-effort)
    try {
      await db.from("cron_heartbeat").upsert(
        { job_name: "on-order-done", last_run: new Date().toISOString() },
        { onConflict: "job_name" },
      );
    } catch { /* abaikan agar tidak gagalkan fungsi */ }
    return Response.json({ ok: true, skipped: "loyalty disabled" }, { headers: CORS });
  }

  // ── Hitung total order + spent customer ini ───────────────────────────────────
  const { count: totalOrders } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_wa", order.customer_wa)
    .eq("status", "done");

  const { data: spentRows } = await db
    .from("orders")
    .select("total")
    .eq("customer_wa", order.customer_wa)
    .eq("status", "done");

  const totalSpent = (spentRows || []).reduce(
    (s: number, o: { total: number }) => s + (o.total || 0), 0
  );

  // ── Upsert customer ──────────────────────────────────────────────────────────
  const { data: existing } = await db
    .from("customers")
    .select("first_order_at")
    .eq("wa_number", order.customer_wa)
    .single();

  await db.from("customers").upsert({
    wa_number:      order.customer_wa,
    name:           order.customer_name,
    total_orders:   totalOrders || 0,
    total_spent:    totalSpent,
    first_order_at: existing?.first_order_at || new Date().toISOString(),
    last_order_at:  new Date().toISOString(),
    updated_at:     new Date().toISOString(),
  }, { onConflict: "wa_number" });

  // ── Cek milestone ─────────────────────────────────────────────────────────────
  const milestones = [1, 2, 3].map(n => ({
    count:  parseInt(settings[`loyalty_milestone_${n}`] ?? "9999"),
    reward: settings[`loyalty_reward_${n}`] ?? "",
  }));

  const hit = milestones.find(m => m.count === (totalOrders || 0));
  if (!hit) {
    return Response.json({ ok: true, total_orders: totalOrders }, { headers: CORS });
  }

  // ── Cek sudah ada voucher aktif untuk milestone ini? ──────────────────────────
  const { data: existingVoucher } = await db
    .from("vouchers")
    .select("id")
    .eq("customer_wa", order.customer_wa)
    .eq("milestone", hit.count)
    .eq("is_used", false)
    .maybeSingle();

  if (existingVoucher) {
    return Response.json({ ok: true, skipped: "voucher already exists" }, { headers: CORS });
  }

  // ── Generate kode unik (max 5 percobaan) ─────────────────────────────────────
  let voucherCode = "";
  for (let i = 0; i < 5; i++) {
    const candidate = generateVoucherCode();
    const { data: clash } = await db
      .from("vouchers").select("id").eq("code", candidate).maybeSingle();
    if (!clash) { voucherCode = candidate; break; }
  }
  if (!voucherCode) {
    return Response.json({ error: "Gagal generate kode unik" }, { status: 500, headers: CORS });
  }

  // ── Insert voucher ────────────────────────────────────────────────────────────
  await db.from("vouchers").insert({
    code:        voucherCode,
    customer_wa: order.customer_wa,
    milestone:   hit.count,
    reward_desc: hit.reward,
  });

  // ── Kirim WA jika auto-notif aktif ────────────────────────────────────────────
  const autoNotif  = settings["loyalty_notif_auto"] === "true";
  const outletName = (order.outlets as { name: string } | null)?.name || "SUKA Shawarma";

  if (autoNotif && FONNTE_TOKEN) {
    const msg =
      `🎉 *Selamat ${order.customer_name}!*\n\n` +
      `Kamu sudah melakukan *${hit.count}× pembelian* di SUKA Shawarma 🌯\n\n` +
      `Sebagai pelanggan setia, kamu mendapatkan:\n` +
      `✨ *${hit.reward}*\n\n` +
      `Kode voucher kamu: *${voucherCode}*\n\n` +
      `Tunjukkan kode ini ke kasir ${outletName} saat pickup ya!\n\n` +
      `Terima kasih sudah setia bersama SUKA Shawarma! 🙏`;
    await kirimWA(FONNTE_TOKEN, order.customer_wa, msg);
  }

  // ── Log ───────────────────────────────────────────────────────────────────────
  await db.from("notification_logs").insert({
    order_id: order_id,
    event:    "voucher_earned",
    results:  JSON.stringify({ voucher_code: voucherCode, auto_notif: autoNotif }),
    sent_at:  new Date().toISOString(),
  }).select();

  // Catat heartbeat — bukti cron masih hidup (best-effort)
  try {
    await db.from("cron_heartbeat").upsert(
      { job_name: "on-order-done", last_run: new Date().toISOString() },
      { onConflict: "job_name" },
    );
  } catch { /* abaikan agar tidak gagalkan fungsi */ }

  return Response.json({
    ok:           true,
    voucher_code: voucherCode,
    milestone:    hit.count,
    reward:       hit.reward,
    notif_sent:   autoNotif,
  }, { headers: CORS });
});
