import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${Deno.env.get('KASIR_TO_ORDER_SECRET')}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { action, outlet } = await req.json()
    if (!action || !outlet || !outlet.id) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (action === 'delete') {
      const { error } = await supabase
        .from('outlets')
        .delete()
        .eq('pos_outlet_id', outlet.id)
      
      if (error) throw error
    } else if (action === 'upsert') {
      // Create slug from name
      let baseSlug = outlet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
      if (!baseSlug) baseSlug = 'outlet'

      // Check if exists
      const { data: existing } = await supabase
        .from('outlets')
        .select('id')
        .eq('pos_outlet_id', outlet.id)
        .maybeSingle()

      const payload = {
        name: outlet.name,
        address: outlet.address || '-',
        phone_wa: outlet.phone || '-',
        is_active: outlet.is_active,
        type: outlet.type || 'owned',
        open_hour: outlet.open_hour ? outlet.open_hour.substring(0, 5) + ':00' : '13:00:00',
        close_hour: outlet.close_hour ? outlet.close_hour.substring(0, 5) + ':00' : '22:00:00',
        pos_outlet_id: outlet.id
      }

      if (existing) {
        const { error } = await supabase
          .from('outlets')
          .update(payload)
          .eq('id', existing.id)
        if (error) throw error
      } else {
        // Find unique slug
        let finalSlug = baseSlug
        let slugCounter = 1
        while (true) {
          const { data: checkSlug } = await supabase.from('outlets').select('id').eq('slug', finalSlug).maybeSingle()
          if (!checkSlug) break
          finalSlug = `${baseSlug}-${slugCounter}`
          slugCounter++
        }
        
        const { error } = await supabase
          .from('outlets')
          .insert({ ...payload, slug: finalSlug })
        if (error) throw error
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error('Error syncing outlet:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
