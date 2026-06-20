const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ipwkiizicobqdpfcmgvc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwd2tpaXppY29icWRwZmNtZ3ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjE5MjgsImV4cCI6MjA5NzI5NzkyOH0.TAPd3KfXRk3TcW0JOJcix7zP-enBeZ7ExiQHK_QjYNQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('outlets').select('id, name, pos_outlet_id');
  if (error) {
    console.error('Error fetching outlets:', error);
  } else {
    console.log('Outlets data:', data);
  }
}

check();
