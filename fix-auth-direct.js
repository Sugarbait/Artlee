/**
 * Direct Authentication Fix Script
 * Fixes ID mismatch between Supabase Auth and database users table
 *
 * Usage: node fix-auth-direct.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cpkslvmydfdevdftieck.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0';

const USER_EMAIL = 'create@artlee.agency';
const TENANT_ID = 'artlee';

async function runDiagnostics(supabase) {
  console.log('\n🔍 Running Diagnostics...\n');

  try {
    // Check database user
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', USER_EMAIL)
      .eq('tenant_id', TENANT_ID)
      .single();

    if (dbError) {
      console.error('❌ Database User Error:', dbError.message);
    } else if (dbUser) {
      console.log('✅ Database User Found:');
      console.log('   ID:', dbUser.id);
      console.log('   Email:', dbUser.email);
      console.log('   Name:', dbUser.name);
      console.log('   Role:', dbUser.role);
      console.log('   Active:', dbUser.is_active);
      console.log('   Tenant:', dbUser.tenant_id);
    } else {
      console.log('⚠️  Database User: Not found');
    }

    // Check auth user
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      console.error('\n❌ Auth User Error:', authError.message);
    } else {
      const authUser = authUsers.users.find(u => u.email === USER_EMAIL);
      if (authUser) {
        console.log('\n✅ Auth User Found:');
        console.log('   ID:', authUser.id);
        console.log('   Email:', authUser.email);
        console.log('   Created:', authUser.created_at);
      } else {
        console.log('\n⚠️  Auth User: Not found');
      }

      // Check ID match
      if (dbUser && authUser) {
        if (dbUser.id === authUser.id) {
          console.log('\n✅ ID MATCH - Authentication should work!');
          return { match: true, dbUser, authUser };
        } else {
          console.log('\n❌ ID MISMATCH DETECTED:');
          console.log('   Database ID:', dbUser.id);
          console.log('   Auth ID:', authUser.id);
          console.log('   This needs to be fixed!');
          return { match: false, dbUser, authUser };
        }
      }
    }

    return { match: false, dbUser: null, authUser: null };
  } catch (error) {
    console.error('❌ Diagnostics Error:', error.message);
    return { match: false, dbUser: null, authUser: null };
  }
}

async function fixIdMismatch(supabase, authId) {
  console.log('\n🔧 Fixing ID Mismatch...\n');

  try {
    // Update database user ID to match Auth ID
    const { data, error } = await supabase
      .from('users')
      .update({ id: authId })
      .eq('email', USER_EMAIL)
      .eq('tenant_id', TENANT_ID)
      .select()
      .single();

    if (error) {
      console.error('❌ Update Error:', error.message);
      return false;
    }

    console.log('✅ Success! Database user ID updated to:', authId);
    console.log('\nYou can now login with:');
    console.log('   Email:', USER_EMAIL);
    console.log('   Password: test1000!');
    console.log('   URL: http://localhost:3001\n');

    return true;
  } catch (error) {
    console.error('❌ Fix Error:', error.message);
    return false;
  }
}

async function testLogin(supabase) {
  console.log('\n🧪 Testing Login...\n');

  const password = 'test1000!';

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: USER_EMAIL,
      password: password
    });

    if (error) {
      console.error('❌ Login Failed:', error.message);
      return false;
    }

    console.log('✅ Login Successful!');
    console.log('   Auth User ID:', data.user.id);
    console.log('   Email:', data.user.email);

    // Check database user
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', USER_EMAIL)
      .eq('tenant_id', TENANT_ID)
      .single();

    if (dbUser) {
      console.log('\n✅ Database User Found:');
      console.log('   Database User ID:', dbUser.id);
      console.log('   Name:', dbUser.name);
      console.log('   Role:', dbUser.role);
      console.log('   Active:', dbUser.is_active);

      if (data.user.id === dbUser.id) {
        console.log('\n✅ IDs MATCH - Authentication working correctly!\n');
      } else {
        console.log('\n❌ ID MISMATCH - Auth:', data.user.id, 'DB:', dbUser.id, '\n');
      }
    }

    // Sign out
    await supabase.auth.signOut();

    return true;
  } catch (error) {
    console.error('❌ Test Login Error:', error.message);
    return false;
  }
}

async function createFreshUser(supabase, email, name, password) {
  console.log('\n🆕 Creating Fresh User...\n');

  try {
    // Create auth user first
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: name,
        tenant_id: TENANT_ID
      }
    });

    if (authError) {
      console.error('❌ Auth User Creation Error:', authError.message);
      return false;
    }

    console.log('✅ Auth User Created:');
    console.log('   ID:', authUser.user.id);
    console.log('   Email:', authUser.user.email);

    // Create database user with same ID
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .insert({
        id: authUser.user.id,
        email: email,
        name: name,
        role: 'user',
        tenant_id: TENANT_ID,
        is_active: true,
        mfa_enabled: false,
        last_login: null
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Database User Creation Error:', dbError.message);
      // Rollback auth user
      await supabase.auth.admin.deleteUser(authUser.user.id);
      console.log('⚠️  Rolled back auth user creation');
      return false;
    }

    console.log('\n✅ Database User Created:');
    console.log('   ID:', dbUser.id);
    console.log('   Email:', dbUser.email);
    console.log('   Name:', dbUser.name);
    console.log('   Tenant:', dbUser.tenant_id);
    console.log('\n✅ New user ready to use!\n');

    return true;
  } catch (error) {
    console.error('❌ Create User Error:', error.message);
    return false;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  ARTLEE Authentication Fix Tool       ║');
  console.log('╚════════════════════════════════════════╝\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Run diagnostics
  const { match, dbUser, authUser } = await runDiagnostics(supabase);

  if (match) {
    console.log('\n✨ Everything looks good! Testing login...');
    await testLogin(supabase);
    return;
  }

  if (!dbUser || !authUser) {
    console.log('\n⚠️  Missing user data. Cannot proceed with automatic fix.');
    console.log('   Please use the web tool: http://localhost:3001/fix-artlee-auth.html\n');
    return;
  }

  // Prompt for fix
  console.log('\n🔧 Ready to fix ID mismatch?');
  console.log('   This will update the database user ID to match Auth ID.');
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  // Apply fix
  const fixed = await fixIdMismatch(supabase, authUser.id);

  if (fixed) {
    // Test login
    console.log('✨ Testing login after fix...');
    await testLogin(supabase);
  }

  console.log('\n✅ Done!\n');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runDiagnostics, fixIdMismatch, testLogin, createFreshUser };
