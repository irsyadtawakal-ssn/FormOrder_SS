// supabase/functions/auto-disable-expired-promos/index.ts
// Triggered by pg_cron every hour
// Disables promos where end_at < now

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  try {
    // Only allow POST requests (triggered by cron)
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const now = new Date().toISOString();

    // Find and disable expired promos
    const { data: expiredPromos, error: selectError } = await supabase
      .from('promos')
      .select('id, name')
      .eq('is_active', true)
      .lt('end_at', now)
      .not('end_at', 'is', null);

    if (selectError) {
      throw selectError;
    }

    if (!expiredPromos || expiredPromos.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No expired promos found', disabled: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Disable each expired promo
    const { error: updateError } = await supabase
      .from('promos')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('end_at', now)
      .not('end_at', 'is', null);

    if (updateError) {
      throw updateError;
    }

    console.log(`Auto-disabled ${expiredPromos.length} expired promos`);

    return new Response(
      JSON.stringify({
        message: `Auto-disabled ${expiredPromos.length} expired promos`,
        disabled: expiredPromos.length,
        promos: expiredPromos.map((p: any) => p.name),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error in auto-disable-expired-promos:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
