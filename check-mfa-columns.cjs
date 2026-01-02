const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fslniuhyunzlfcbxsiol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
);

async function checkColumns() {
  console.log('🔍 Checking user_settings table schema...\n');

  // Get a sample record to see all columns
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .limit(1);

  if (error) {
    console.log('❌ Error:', error);
  } else if (data && data[0]) {
    console.log('✅ Available columns in user_settings:');
    console.log(Object.keys(data[0]).sort().join('\n'));
    console.log('\n🔍 MFA-related columns:');
    const mfaColumns = Object.keys(data[0]).filter(k => k.includes('mfa'));
    console.log(mfaColumns.join('\n'));
  }

  console.log('\n🔍 Now testing the exact query that the frontend uses...\n');

  // Try with anon key (what frontend uses)
  const supabaseAnon = createClient(
    'https://fslniuhyunzlfcbxsiol.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTA1MTAsImV4cCI6MjA3NTU4NjUxMH0.1_ln5Dt5p1tagxWwGH77cp9U2nLky6xfHG77VGEgQiI'
  );

  const userId = 'edd07847-d90a-4b1a-9904-e6bc752ff501';

  const { data: anonData, error: anonError } = await supabaseAnon
    .from('user_settings')
    .select(`
      fresh_mfa_secret,
      fresh_mfa_enabled,
      fresh_mfa_setup_completed,
      fresh_mfa_backup_codes,
      mfa_disabled_by_admin,
      mfa_disabled_at,
      mfa_disabled_by_user_id,
      mfa_disable_reason
    `)
    .eq('user_id', userId)
    .eq('tenant_id', 'artlee')
    .single();

  if (anonError) {
    console.log('❌ ANON query failed:', anonError);
    console.log('\n🔍 Checking if columns exist...');

    // Try selecting each column individually
    const columnsToCheck = [
      'fresh_mfa_secret',
      'fresh_mfa_enabled',
      'fresh_mfa_setup_completed',
      'fresh_mfa_backup_codes',
      'mfa_disabled_by_admin',
      'mfa_disabled_at',
      'mfa_disabled_by_user_id',
      'mfa_disable_reason'
    ];

    for (const col of columnsToCheck) {
      const { error: colError } = await supabase
        .from('user_settings')
        .select(col)
        .limit(1);

      if (colError) {
        console.log(`❌ Column "${col}" - ERROR: ${colError.message}`);
      } else {
        console.log(`✅ Column "${col}" - EXISTS`);
      }
    }
  } else {
    console.log('✅ ANON query SUCCESS:', anonData);
  }
}

checkColumns().catch(console.error);
