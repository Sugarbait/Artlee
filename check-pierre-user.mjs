import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cpkslvmydfdevdftieck.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

console.log('🔍 Checking user: pierre@phaetonai.com\n')

// Check in users table
const { data: users, error: usersError } = await supabase
  .from('users')
  .select('*')
  .eq('email', 'pierre@phaetonai.com')

console.log('📊 Users table results:')
if (usersError) {
  console.error('❌ Error:', usersError)
} else {
  console.log(`✅ Found ${users.length} user(s)`)
  users.forEach(user => {
    console.log('\nUser Details:')
    console.log(`  ID: ${user.id}`)
    console.log(`  Email: ${user.email}`)
    console.log(`  Name: ${user.name || 'N/A'}`)
    console.log(`  Role: ${user.role}`)
    console.log(`  Tenant ID: ${user.tenant_id}`)
    console.log(`  Active: ${user.isActive}`)
    console.log(`  Created: ${user.created_at}`)
  })
}

// Check Supabase Auth users
const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()

console.log('\n\n🔐 Supabase Auth users:')
if (authError) {
  console.error('❌ Error:', authError)
} else {
  const pierreAuth = authUsers.users.find(u => u.email === 'pierre@phaetonai.com')
  if (pierreAuth) {
    console.log('✅ Found in Supabase Auth')
    console.log(`  Auth ID: ${pierreAuth.id}`)
    console.log(`  Email: ${pierreAuth.email}`)
    console.log(`  Email Confirmed: ${pierreAuth.email_confirmed_at ? 'Yes' : 'No'}`)
    console.log(`  Created: ${pierreAuth.created_at}`)
  } else {
    console.log('❌ NOT found in Supabase Auth')
  }
}

// Check user_credentials table
const { data: creds, error: credsError } = await supabase
  .from('user_credentials')
  .select('*')
  .eq('email', 'pierre@phaetonai.com')

console.log('\n\n🔑 User Credentials table:')
if (credsError) {
  console.error('❌ Error:', credsError)
} else {
  console.log(`✅ Found ${creds.length} credential(s)`)
  creds.forEach(cred => {
    console.log('\nCredential Details:')
    console.log(`  User ID: ${cred.user_id}`)
    console.log(`  Email: ${cred.email}`)
    console.log(`  Has Password: ${cred.password ? 'Yes' : 'No'}`)
    console.log(`  Password Length: ${cred.password?.length || 0}`)
  })
}

console.log('\n\n🏢 Checking all phaeton_ai tenant users:')
const { data: allTenantUsers, error: tenantError } = await supabase
  .from('users')
  .select('email, role, isActive, tenant_id')
  .eq('tenant_id', 'phaeton_ai')

if (tenantError) {
  console.error('❌ Error:', tenantError)
} else {
  console.log(`Found ${allTenantUsers.length} user(s) with tenant_id = 'phaeton_ai'`)
  allTenantUsers.forEach(u => {
    console.log(`  - ${u.email} (${u.role}, Active: ${u.isActive})`)
  })
}
