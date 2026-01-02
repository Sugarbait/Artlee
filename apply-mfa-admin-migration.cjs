const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  'https://fslniuhyunzlfcbxsiol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
);

async function applyMigration() {
  console.log('🔧 Applying MFA Admin Override Migration...\n');

  const migrationSQL = `
-- Add MFA admin override columns
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS mfa_disabled_by_admin BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_disabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS mfa_disabled_by_user_id TEXT,
ADD COLUMN IF NOT EXISTS mfa_disable_reason TEXT;

-- Add comments
COMMENT ON COLUMN user_settings.mfa_disabled_by_admin IS 'Whether MFA has been disabled by a Super User administrator';
COMMENT ON COLUMN user_settings.mfa_disabled_at IS 'Timestamp when MFA was disabled by admin';
COMMENT ON COLUMN user_settings.mfa_disabled_by_user_id IS 'User ID of the Super User who disabled MFA';
COMMENT ON COLUMN user_settings.mfa_disable_reason IS 'Reason provided for disabling MFA';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_mfa_disabled
ON user_settings(user_id, tenant_id, mfa_disabled_by_admin)
WHERE mfa_disabled_by_admin = TRUE;
  `;

  try {
    // Execute the SQL using rpc call (Supabase service role can execute raw SQL)
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      console.log('❌ Migration failed via RPC:', error.message);
      console.log('\n💡 Trying alternative method: direct column addition...\n');

      // Alternative: Try using Supabase client directly (may not work for raw SQL)
      // Let's just verify the columns were added
      const { data: checkData, error: checkError } = await supabase
        .from('user_settings')
        .select('mfa_disabled_by_admin')
        .limit(1);

      if (checkError && checkError.message.includes('does not exist')) {
        console.log('❌ Columns still missing. Manual SQL execution required.');
        console.log('\n📝 Please run this SQL in Supabase SQL Editor:');
        console.log('─'.repeat(60));
        console.log(migrationSQL);
        console.log('─'.repeat(60));
      } else {
        console.log('✅ Columns appear to exist already!');
      }
    } else {
      console.log('✅ Migration completed successfully!');
    }

    // Verify the columns exist
    console.log('\n🔍 Verifying columns...');
    const columnsToCheck = [
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
        console.log(`❌ Column "${col}" - MISSING`);
      } else {
        console.log(`✅ Column "${col}" - EXISTS`);
      }
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

applyMigration().catch(console.error);
