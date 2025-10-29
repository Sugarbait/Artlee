import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabaseUrl = 'https://cpkslvmydfdevdftieck.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

console.log('🚀 Setting up Phaeton AI CRM database...\n')

// Read the SQL file
const sql = readFileSync('setup-phaeton-ai-database.sql', 'utf-8')

// Split by semicolons and filter out empty statements
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'))

console.log(`📝 Found ${statements.length} SQL statements to execute\n`)

let successCount = 0
let errorCount = 0

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i]

  // Skip comments and verification queries at the end
  if (statement.startsWith('--') ||
      statement.toLowerCase().includes('select') ||
      statement.toLowerCase().includes('verification')) {
    continue
  }

  console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`)

  const { data, error } = await supabase.rpc('exec_sql', { sql: statement + ';' })

  if (error) {
    console.log(`❌ Error: ${error.message}`)
    errorCount++
  } else {
    console.log(`✅ Success`)
    successCount++
  }
}

console.log(`\n📊 Results:`)
console.log(`✅ Successful: ${successCount}`)
console.log(`❌ Failed: ${errorCount}`)

// Verify setup
console.log('\n🔍 Verifying setup...\n')

const { data: users, error: usersError } = await supabase
  .from('users')
  .select('email, name, role, is_active, tenant_id')
  .eq('email', 'pierre@phaetonai.com')

if (usersError) {
  console.log('❌ Could not verify user:', usersError.message)
} else if (users && users.length > 0) {
  console.log('✅ Pierre user found in database!')
  console.log(users[0])
} else {
  console.log('⚠️ Pierre user not found. Please check the migration.')
}

console.log('\n✨ Database setup complete!')
console.log('\n📌 Next steps:')
console.log('1. Refresh the app at http://localhost:3001')
console.log('2. Login with pierre@phaetonai.com')
console.log('3. You should now have full access as Super User!')
