// Script sekali pakai — buat akun outlet staff untuk semua 19 outlet
// Jalankan: node scripts/create-staff-accounts.mjs YOUR_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = 'https://qntuhtkujpwudcpudwbj.supabase.co';
const SERVICE_ROLE_KEY = process.argv[2];

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Usage: node scripts/create-staff-accounts.mjs YOUR_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const OUTLETS = [
  'kitchen', 'empang', 'paledang', 'cimanggu', 'depok-sukmajaya',
  'jagakarsa', 'beji', 'sawangan', 'pajajaran', 'jatiwaringin',
  'cirendeu', 'jatiasih', 'dramaga',
  'cibinong', 'citayam', 'tebet', 'ciseeng', 'pekayon', 'kalisari'
];

const PASSWORD = 'ss1234';

async function main() {
  // Ambil semua outlet dari DB untuk dapat ID-nya
  const { data: dbOutlets, error: outletErr } = await supabase
    .from('outlets')
    .select('id, slug, name');

  if (outletErr) {
    console.error('❌ Gagal ambil outlets:', outletErr.message);
    process.exit(1);
  }

  const outletMap = Object.fromEntries(dbOutlets.map(o => [o.slug, o]));

  let created = 0, skipped = 0, failed = 0;

  for (const slug of OUTLETS) {
    const outlet = outletMap[slug];
    if (!outlet) {
      console.warn(`⚠️  Outlet '${slug}' tidak ditemukan di database, skip`);
      skipped++;
      continue;
    }

    const email    = `ss.${slug}@shawarma.com`;
    const fullName = `SS ${outlet.name.replace('SUKA Shawarma ', '').replace('Mitra SUKA Shawarma ', '')}`;

    // Buat user di Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,  // langsung confirm, tidak perlu verifikasi email
      user_metadata: { full_name: fullName }
    });

    if (authErr) {
      if (authErr.message.includes('already been registered')) {
        console.log(`⏭️  ${email} sudah ada, skip`);
        skipped++;
        continue;
      }
      console.error(`❌ ${email}: ${authErr.message}`);
      failed++;
      continue;
    }

    const userId = authData.user.id;

    // Insert ke tabel admin_users
    const { error: dbErr } = await supabase
      .from('admin_users')
      .upsert({
        id:        userId,
        email,
        full_name: fullName,
        role:      'outlet_staff',
        outlet_id: outlet.id,
        is_active: true
      }, { onConflict: 'id' });

    if (dbErr) {
      console.error(`❌ admin_users insert ${email}: ${dbErr.message}`);
      failed++;
      continue;
    }

    console.log(`✅ ${email} → ${outlet.name}`);
    created++;
  }

  console.log(`\n📊 Selesai: ${created} dibuat, ${skipped} skip, ${failed} error`);
}

main();
