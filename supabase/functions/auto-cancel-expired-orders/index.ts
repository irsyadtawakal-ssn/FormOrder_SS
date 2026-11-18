// Edge Function: auto-cancel-expired-orders
// Tandai order pending_payment yang sudah melewati expires_at menjadi 'expired'
// Dipanggil via pg_cron (tiap 1 menit) atau manual via HTTP POST

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FONNTE_TOKEN = Deno.env.get("FONNTE_TOKEN");

  // Hanya service role yang boleh memanggil fungsi ini.
  // Diterima: (a) persis env SUPABASE_SERVICE_ROLE_KEY, atau (b) JWT ber-role
  // 'service_role'. (b) aman HANYA karena fungsi ini di-deploy dengan
  // verify_jwt = true — tanda tangan JWT sudah diverifikasi gateway sebelum
  // kode jalan. Dibutuhkan karena env di runtime bisa berformat kunci baru
  // (bukan JWT legacy) sehingga tak pernah sama dengan kunci yang dikirim cron.
  const authHeader = req.headers.get("authorization") ?? "";
  const token      = authHeader.replace(/^Bearer\s+/i, "").trim();
  let peranJwt = "";
  try {
    const bagian = token.split(".")[1] ?? "";
    const b64 = bagian.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(bagian.length / 4) * 4, "=");
    peranJwt = String(JSON.parse(atob(b64)).role ?? "");
  } catch { /* bukan JWT */ }
  if (token !== SERVICE_KEY && peranJwt !== "service_role") {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Grace period 2 menit: beri jeda aman bagi transaksi yang sedang diselesaikan
  // customer di perbankan / webhook Xendit yang sedang dalam transit
  const GRACE_PERIOD_MS = 2 * 60 * 1000;
  const cutoffTime = new Date(Date.now() - GRACE_PERIOD_MS).toISOString();
  const now = new Date().toISOString();

  // Ambil order yang sudah melewati expires_at + grace period
  const { data: expiredOrders, error: fetchErr } = await db
    .from("orders")
    .select("id, order_number, customer_name, customer_wa, tripay_reference, expires_at, outlets(name)")
    .eq("status", "pending_payment")
    .lt("expires_at", cutoffTime);

  if (fetchErr) {
    console.error("Gagal ambil expired orders:", fetchErr.message);
    return Response.json({ error: fetchErr.message }, { status: 500, headers: CORS });
  }

  if (!expiredOrders || expiredOrders.length === 0) {
    // Catat heartbeat — bukti cron masih hidup (best-effort, tidak gagalkan response)
    try {
      await db.from("cron_heartbeat").upsert(
        { job_name: "auto-cancel-expired-orders", last_run: new Date().toISOString() },
        { onConflict: "job_name" },
      );
    } catch { /* abaikan agar tidak gagalkan cron */ }
    return Response.json({ ok: true, expired_count: 0 }, { headers: CORS });
  }

  // ─── Tanya Xendit dulu sebelum menandai expired ─────────────────────────
  // Insiden Okt–Nov 2026: pelanggan sudah bayar QRIS, menutup halaman sebelum
  // polling sempat jalan, webhook tak sampai → cron ini menandai 'expired' dan
  // mengirim WA "kedaluwarsa" padahal uang sudah masuk Xendit.
  //  - Xendit SUCCEEDED  → JANGAN expire; serahkan ke check-xendit-status yang
  //                        sudah punya alur pemulihan lengkap (paid, WA, POS, promo).
  //  - Xendit tak bisa ditanya (error/jaringan) → tunda ke putaran berikutnya,
  //                        kecuali sudah lewat BATAS_TUNDA_MS (expire seperti biasa).
  //  - Status lain (PENDING, EXPIRED, FAILED, dll) → expire seperti biasa.
  //    Kalau pelanggan ternyata bayar belakangan, xendit-webhook me-revive order.
  const xenditSecretKey = Deno.env.get("XENDIT_SECRET_KEY");
  const BATAS_TUNDA_MS = 60 * 60 * 1000;
  const ditunda = new Set<string>();

  if (xenditSecretKey) {
    const xenditAuth = "Basic " + btoa(xenditSecretKey + ":");
    for (const o of expiredOrders) {
      const ref = String(o.tripay_reference ?? "");
      if (!ref.startsWith("pr-")) continue; // belum ada payment request / simulasi
      const lewatLama = Date.now() - new Date(o.expires_at).getTime() > BATAS_TUNDA_MS;
      try {
        const res = await fetch(`https://api.xendit.co/payment_requests/${ref}`, {
          headers: { Authorization: xenditAuth },
        });
        if (!res.ok) {
          console.warn("Cek Xendit gagal:", o.order_number, res.status);
          if (!lewatLama) ditunda.add(o.id);
          continue;
        }
        const pr = await res.json() as Record<string, unknown>;
        const st = String(pr.status ?? "").toUpperCase();
        if (st === "SUCCEEDED") {
          ditunda.add(o.id);
          console.info("Xendit SUCCEEDED — order dipulihkan, tidak di-expire:", o.order_number);
          const r = await fetch(`${SUPABASE_URL}/functions/v1/check-xendit-status`, {
            method: "POST",
            // Teruskan JWT pemanggil (sudah diverifikasi gateway) — env SERVICE_KEY bisa
            // berformat kunci baru yang ditolak gateway fungsi ber-verify_jwt.
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ order_number: o.order_number }),
          }).catch((err) => { console.error("Gagal memanggil check-xendit-status:", err); return null; });
          if (r) console.info("check-xendit-status:", o.order_number, r.status, await r.text());
        }
      } catch (err) {
        console.warn("Xendit tidak terjangkau:", o.order_number, err);
        if (!lewatLama) ditunda.add(o.id);
      }
    }
  }

  const ids = expiredOrders.filter((o) => !ditunda.has(o.id)).map((o) => o.id);
  if (ids.length === 0) {
    // Semua kandidat ditunda — heartbeat tetap dicatat agar monitor tak mengira cron mati
    try {
      await db.from("cron_heartbeat").upsert(
        { job_name: "auto-cancel-expired-orders", last_run: new Date().toISOString() },
        { onConflict: "job_name" },
      );
    } catch { /* abaikan agar tidak gagalkan cron */ }
    return Response.json({ ok: true, expired_count: 0, ditunda: ditunda.size }, { headers: CORS });
  }

  // Tandai sebagai expired HANYA jika status saat ini masih 'pending_payment'.
  // Guard .eq("status", "pending_payment") dan .select("id") mencegah race condition
  // jika xendit-webhook baru saja mengubah order menjadi 'paid' tepat sebelum update ini dijalankan!
  const { data: cancelledRows, error: updateErr } = await db
    .from("orders")
    .update({
      status:        "expired",
      cancelled_at:  now,
      cancel_reason: "Batas waktu pembayaran habis (otomatis)",
    })
    .in("id", ids)
    .eq("status", "pending_payment")
    .select("id");

  if (updateErr) {
    console.error("Gagal update expired orders:", updateErr.message);
    return Response.json({ error: updateErr.message }, { status: 500, headers: CORS });
  }

  const cancelledIdSet = new Set((cancelledRows ?? []).map((r: { id: string }) => r.id));
  console.log(`auto-expire: ${cancelledIdSet.size} dari ${expiredOrders.length} order → expired`, Array.from(cancelledIdSet));

  // Kirim WA ke customer HANYA untuk order yang benar-benar berhasil diubah menjadi 'expired'
  // (Order yang sudah menjadi 'paid' tidak boleh dikirimi pesan kedaluwarsa!)
  if (FONNTE_TOKEN && cancelledIdSet.size > 0) {
    for (const order of expiredOrders) {
      if (!cancelledIdSet.has(order.id) || !order.customer_wa) continue;
      const outletsData = order.outlets as unknown;
      const outletName = (Array.isArray(outletsData)
        ? (outletsData[0] as { name?: string })?.name
        : (outletsData as { name?: string })?.name) ?? "outlet";
      const pesan =
        `⏰ *Waktu Pembayaran Habis*\n\n` +
        `Halo ${order.customer_name},\n` +
        `Pesanan *${order.order_number}* di ${outletName} sudah kedaluwarsa karena pembayaran tidak ` +
        `diselesaikan tepat waktu.\n\n` +
        `Silakan pesan ulang jika masih berminat. Terima kasih 🙏`;
      await fetch("https://api.fonnte.com/send", {
        method:  "POST",
        headers: { "Authorization": FONNTE_TOKEN, "Content-Type": "application/json" },
        body:    JSON.stringify({ target: order.customer_wa, message: pesan }),
      }).catch(() => {/* abaikan error WA agar tidak gagalkan batch */});
    }
  }

  // Catat heartbeat — bukti cron masih hidup (best-effort, tidak gagalkan response)
  try {
    await db.from("cron_heartbeat").upsert(
      { job_name: "auto-cancel-expired-orders", last_run: new Date().toISOString() },
      { onConflict: "job_name" },
    );
  } catch { /* abaikan agar tidak gagalkan cron */ }

  return Response.json({
    ok:             true,
    expired_count:  cancelledIdSet.size,
    expired_orders: expiredOrders.filter((o) => cancelledIdSet.has(o.id)).map((o) => o.order_number),
    ditunda:        ditunda.size,
  }, { headers: CORS });
});
