
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const config = fs.readFileSync('config.js', 'utf8');
const urlMatch = config.match(/supabaseUrl:\s*['"]([^'"]+)['"]/);
const keyMatch = config.match(/supabaseAnonKey:\s*['"]([^'"]+)['"]/);
if (urlMatch && keyMatch) {
  const supabase = createClient(urlMatch[1], keyMatch[1]);
  supabase.functions.invoke('create-xendit-payment', {
    body: {
      outlet_slug: 'suhat-malang',
      items: [{ menu_item_id: 'a89cdeed-3377-4cf0-bb47-79cdcc7b3d30', quantity: 1, option_ids: [], selections: {} }],
      customer_name: 'test',
      customer_wa: '081111111111',
      pickup_time: '12:00',
      payment_channel: 'BRI'
    }
  }).then(async res => {
    if (res.error && res.error.context && res.error.context.json) {
       console.log('DEBUG:', await res.error.context.json());
    } else {
       console.log('RES:', res);
    }
  });
}

