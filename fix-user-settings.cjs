const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fslniuhyunzlfcbxsiol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
);

async function checkAndFixUserSettings() {
  const userId = 'edd07847-d90a-4b1a-9904-e6bc752ff501';

  console.log('🔍 Checking user_settings for user:', userId);
  console.log('');

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', 'artlee');

  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ No user_settings record found for this user!');
    console.log('');
    console.log('📝 Creating user_settings record with MFA columns...');

    const { data: insertData, error: insertError } = await supabase
      .from('user_settings')
      .insert({
        user_id: userId,
        tenant_id: 'artlee',
        theme: 'light',
        notifications: { email: true, sms: true, push: true, in_app: true },
        fresh_mfa_secret: null,
        fresh_mfa_enabled: false,
        fresh_mfa_setup_completed: false,
        fresh_mfa_backup_codes: null
      })
      .select();

    if (insertError) {
      console.log('❌ Insert failed:', insertError.message);
    } else {
      console.log('✅ User settings created successfully!');
      console.log(insertData);
    }
  } else {
    console.log('✅ User settings found:');
    console.log('   - fresh_mfa_enabled:', data[0].fresh_mfa_enabled);
    console.log('   - fresh_mfa_setup_completed:', data[0].fresh_mfa_setup_completed);
    console.log('   - Has secret:', !!data[0].fresh_mfa_secret);
  }
}

checkAndFixUserSettings().catch(console.error);
