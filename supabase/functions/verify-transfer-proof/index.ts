// Edge Function: verify-transfer-proof
// Analisis bukti transfer dengan AI (OpenRouter Gemini) dan bandingkan dengan data order

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const AI_MODEL       = "google/gemini-3.1-flash-lite";

interface ExtractedTransfer {
  nominal:       number | null;
  penerima:      string | null;
  bank_penerima: string | null;
  status:        string | null;
  error?:        string;
}

interface VerifyResult {
  confidence:    "high" | "medium" | "low" | "error";
  match:         boolean;
  auto_approved: boolean;
  extracted:     ExtractedTransfer;
  reason:        string;
}

async function getImageAsBase64(url: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf  = await res.arrayBuffer();
    const mime = res.headers.get("content-type") || "image/jpeg";
    const b64  = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return { base64: b64, mime };
  } catch {
    return null;
  }
}

async function analyzeWithAI(
  imageBase64: string,
  imageMime: string,
  openrouterKey: string
): Promise<ExtractedTransfer> {
  const prompt = `Kamu adalah sistem verifikasi pembayaran transfer bank Indonesia.
Analisis screenshot bukti transfer ini dan ekstrak informasi berikut.

Kembalikan HANYA JSON ini (tidak ada teks lain):
{
  "nominal": <angka rupiah tanpa simbol, contoh: 45000>,
  "penerima": "<nama penerima transfer>",
  "bank_penerima": "<nama bank penerima, contoh: BCA, Mandiri, BNI, BRI>",
  "status": "<berhasil / sukses / pending / gagal>"
}

Jika gambar bukan screenshot transfer bank atau tidak terbaca, kembalikan:
{"error": "bukan bukti transfer valid"}`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization":  `Bearer ${openrouterKey}`,
      "Content-Type":   "application/json",
      "HTTP-Referer":   "https://order.sukashawarma.com",
      "X-Title":        "SUKA Shawarma Transfer Verifier",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${imageMime};base64,${imageBase64}` },
          },
          { type: "text", text: prompt },
        ],
      }],
      max_tokens: 300,
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);

  const json = await res.json();
  const raw  = json.choices?.[0]?.message?.content?.trim() || "";

  // Parse JSON dari respons AI
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI tidak mengembalikan JSON valid");

  return JSON.parse(jsonMatch[0]) as ExtractedTransfer;
}

function compareWithOrder(
  extracted: ExtractedTransfer,
  orderTotal: number,
  expectedRecipient: string,
  expectedBank: string
): { match: boolean; confidence: "high" | "medium" | "low"; reason: string } {
  if (extracted.error) {
    return { match: false, confidence: "low", reason: extracted.error };
  }

  const reasons: string[] = [];
  let score = 0;

  // Cek nominal (toleransi ±1% untuk pembulatan)
  if (extracted.nominal !== null) {
    const diff = Math.abs(extracted.nominal - orderTotal) / orderTotal;
    if (diff === 0) {
      score += 3; reasons.push(`Nominal tepat (Rp ${extracted.nominal.toLocaleString("id-ID")})`);
    } else if (diff <= 0.01) {
      score += 2; reasons.push(`Nominal hampir sama (Rp ${extracted.nominal.toLocaleString("id-ID")})`);
    } else {
      score -= 2; reasons.push(`Nominal tidak cocok: AI baca Rp ${extracted.nominal?.toLocaleString("id-ID")}, order Rp ${orderTotal.toLocaleString("id-ID")}`);
    }
  }

  // Cek nama penerima (case-insensitive, partial match)
  if (extracted.penerima) {
    const rcvLower  = extracted.penerima.toLowerCase();
    const expLower  = expectedRecipient.toLowerCase();
    const words     = expLower.split(/\s+/);
    const matchedWords = words.filter(w => rcvLower.includes(w) || w.includes(rcvLower));
    if (matchedWords.length >= 2) {
      score += 2; reasons.push(`Penerima cocok: "${extracted.penerima}"`);
    } else if (matchedWords.length === 1) {
      score += 1; reasons.push(`Penerima sebagian cocok: "${extracted.penerima}"`);
    } else {
      score -= 1; reasons.push(`Penerima berbeda: "${extracted.penerima}"`);
    }
  }

  // Cek bank
  if (extracted.bank_penerima) {
    if (extracted.bank_penerima.toLowerCase().includes(expectedBank.toLowerCase())) {
      score += 2; reasons.push(`Bank cocok: ${extracted.bank_penerima}`);
    } else {
      score -= 1; reasons.push(`Bank berbeda: ${extracted.bank_penerima}`);
    }
  }

  // Cek status transfer
  const statusOk = ["berhasil", "sukses", "success", "berhasil dikirim"].some(s =>
    extracted.status?.toLowerCase().includes(s)
  );
  if (statusOk) {
    score += 1; reasons.push("Status transfer berhasil");
  } else if (extracted.status) {
    score -= 2; reasons.push(`Status transfer: ${extracted.status}`);
  }

  const match      = score >= 5;
  const confidence = score >= 6 ? "high" : score >= 3 ? "medium" : "low";

  return { match, confidence, reason: reasons.join(" · ") };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY");
  const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!OPENROUTER_KEY) {
    return Response.json({ error: "OPENROUTER_API_KEY tidak dikonfigurasi" }, { status: 500, headers: CORS });
  }

  let body: { order_id: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400, headers: CORS });
  }

  const { order_id } = body;
  if (!order_id) return Response.json({ error: "order_id wajib diisi" }, { status: 400, headers: CORS });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Ambil data order
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, order_number, total, status, proof_url, outlets(name)")
    .eq("id", order_id)
    .single();

  if (orderErr || !order) {
    return Response.json({ error: "Order tidak ditemukan" }, { status: 404, headers: CORS });
  }

  if (!order.proof_url) {
    return Response.json({ error: "Belum ada bukti transfer" }, { status: 400, headers: CORS });
  }

  if (order.status !== "awaiting_verification") {
    return Response.json({ error: "Status order bukan awaiting_verification" }, { status: 400, headers: CORS });
  }

  // Baca mode verifikasi dari app_settings
  const { data: modeSetting } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "verification_mode")
    .single();
  const verificationMode = modeSetting?.value || "manual";

  // Buat signed URL untuk akses gambar (bucket private)
  const proofPath = order.proof_url.split("/transfer-proofs/")[1];
  let imageUrl    = order.proof_url;

  if (proofPath) {
    const { data: signedData } = await db.storage
      .from("transfer-proofs")
      .createSignedUrl(proofPath, 60);
    if (signedData?.signedUrl) imageUrl = signedData.signedUrl;
  }

  // Download gambar sebagai base64
  const imgData = await getImageAsBase64(imageUrl);
  if (!imgData) {
    return Response.json({ error: "Gagal mengakses gambar bukti transfer" }, { status: 500, headers: CORS });
  }

  let result: VerifyResult;

  try {
    // Analisis AI
    const extracted = await analyzeWithAI(imgData.base64, imgData.mime, OPENROUTER_KEY);

    // Bandingkan dengan data order
    const comparison = compareWithOrder(
      extracted,
      order.total,
      "PT Suka Profit Berkah",
      "BCA"
    );

    const autoApprove = verificationMode === "ai" && comparison.confidence === "high" && comparison.match;

    result = {
      confidence:    comparison.confidence,
      match:         comparison.match,
      auto_approved: autoApprove,
      extracted,
      reason:        comparison.reason,
    };

    // Simpan hasil AI ke order
    await db.from("orders").update({
      ai_verification_result: result,
    }).eq("id", order_id);

    // Auto-approve jika mode AI dan confidence tinggi
    if (autoApprove) {
      await db.rpc("verify_transfer", { p_order_id: order_id, p_action: "approve" });

      // Kirim WA notif ke customer
      const notifUrl = `${SUPABASE_URL}/functions/v1/send-wa-notifications`;
      await fetch(notifUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order_id, event: "transfer_verified" }),
      }).catch(() => {});
    }

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result = {
      confidence:    "error",
      match:         false,
      auto_approved: false,
      extracted:     { nominal: null, penerima: null, bank_penerima: null, status: null, error: msg },
      reason:        "AI error: " + msg,
    };
    await db.from("orders").update({ ai_verification_result: result }).eq("id", order_id);
  }

  return Response.json({ ok: true, result }, { headers: CORS });
});
