
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const config = fs.readFileSync('config.js', 'utf8');
const urlMatch = config.match(/supabaseUrl:\s*['"]([^'"]+)['"]/);
const keyMatch = config.match(/supabaseAnonKey:\s*['"]([^'"]+)['"]/);
if (urlMatch && keyMatch) {
  const supabase = createClient(urlMatch[1], keyMatch[1]);
  supabase.from('outlets').select('id,slug').limit(1).then(res => {
     console.log('OUTLET:', res.data);
     if (res.data && res.data[0]) {
         supabase.from('menu_items').select('id').limit(1).then(mRes => {
             console.log('MENU_ITEM:', mRes.data);
             if (mRes.data && mRes.data[0]) {
                 supabase.functions.invoke('create-xendit-payment', {
                    body: {
                      outlet_slug: res.data[0].slug,
                      items: [{ menu_item_id: mRes.data[0].id, quantity: 1, option_ids: [], selections: {} }],
                      customer_name: 'test',
                      customer_wa: '081111111111',
                      pickup_time: '12:00',
                      payment_channel: 'BRI'
                    }
                 }).then(async edgeRes => {
                    if (edgeRes.error && edgeRes.error.context && edgeRes.error.context.json) {
                       console.log('DEBUG:', await edgeRes.error.context.json());
                    } else {
                       console.log('RES:', edgeRes);
                    }
                 });
             }
         });
     }
  });
}

