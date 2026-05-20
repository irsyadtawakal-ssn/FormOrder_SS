// Edge Function: create-admin-user
// Buat akun Supabase Auth + row admin_users untuk outlet_staff baru
// Hanya super_admin yang bisa memanggil endpoint ini

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ── Verifikasi caller adalah super_admin ────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Client dengan JWT caller untuk verifikasi identitas + role
    const callerDb = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authErr } = await callerDb.auth.getUser();
    if (authErr || !caller) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const { data: profile } = await callerDb
      .from("admin_users")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!profile || profile.role !== "super_admin") {
      return Response.json({ error: "Hanya super_admin yang bisa membuat akun staff" }, { status: 403, headers: CORS });
    }

    // ── Parse payload ───────────────────────────────────────────────────────
    const { email, password, full_name, role, outlet_id } = await req.json();

    if (!email || !password || !full_name) {
      return Response.json({ error: "email, password, dan full_name wajib diisi" }, { status: 400, headers: CORS });
    }
    if (!["super_admin", "outlet_staff"].includes(role)) {
      return Response.json({ error: "role tidak valid" }, { status: 400, headers: CORS });
    }
    if (role === "outlet_staff" && !outlet_id) {
      return Response.json({ error: "outlet_id wajib untuk outlet_staff" }, { status: 400, headers: CORS });
    }
    if (password.length < 8) {
      return Response.json({ error: "Password minimal 8 karakter" }, { status: 400, headers: CORS });
    }

    // ── Admin client (service role) ─────────────────────────────────────────
    const adminDb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Buat auth user — langsung dikonfirmasi (tidak perlu email verifikasi)
    const { data: { user }, error: createErr } = await adminDb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !user) {
      return Response.json({ error: createErr?.message ?? "Gagal membuat user" }, { status: 400, headers: CORS });
    }

    // Insert admin_users row
    const { error: profileErr } = await adminDb.from("admin_users").insert({
      id:        user.id,
      email,
      full_name,
      role,
      outlet_id: outlet_id ?? null,
      is_active: true,
    });

    if (profileErr) {
      // Rollback: hapus auth user agar tidak ada orphaned record
      await adminDb.auth.admin.deleteUser(user.id);
      return Response.json({ error: profileErr.message }, { status: 400, headers: CORS });
    }

    return Response.json({ success: true, user_id: user.id }, { headers: CORS });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500, headers: CORS });
  }
});
