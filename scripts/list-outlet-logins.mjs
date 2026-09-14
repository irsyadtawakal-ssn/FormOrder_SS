import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Set SUPABASE_URL & SUPABASE_ANON_KEY env vars');
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey);

const { data: outlets, error } = await db
  .from('outlets')
  .select('id, name, slug')
  .order('name');

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('\n📋 SUKA Shawarma — Outlet Staff Login Credentials\n');
console.log('Format: Email / Password\n');
console.log('─'.repeat(60));

outlets.forEach((outlet, idx) => {
  const email = `ss.${outlet.slug}@shawarma.com`;
  const password = 'ss1234';
  console.log(`${idx + 1}. ${outlet.name}`);
  console.log(`   Email: ${email}`);
  console.log(`   Pass:  ${password}`);
  console.log();
});

console.log('─'.repeat(60));
console.log(`Total: ${outlets.length} outlet staff accounts\n`);
