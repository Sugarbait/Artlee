import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = 'https://cpkslvmydfdevdftieck.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

console.log('🔐 Fixing password for pierre@phaetonai.com\n')

// The password you used during registration
const password = '$Ineed1millie$_nexasync'
const email = 'pierre@phaetonai.com'
const userId = 'ee8f5c7a-06da-45d0-910b-12bc35ae70db'

console.log('Step 1: Updating Supabase Auth password...')

// Update the Supabase Auth user's password
const { data: authData, error: authError } = await supabase.auth.admin.updateUserById(
  userId,
  { password: password }
)

if (authError) {
  console.log('❌ Auth update failed:', authError.message)
} else {
  console.log('✅ Supabase Auth password updated successfully')
}

console.log('\nStep 2: Creating user_credentials entry...')

// Hash the password
const salt = await bcrypt.genSalt(10)
const hashedPassword = await bcrypt.hash(password, salt)

// Insert into user_credentials table
const { data: credData, error: credError } = await supabase
  .from('user_credentials')
  .upsert({
    user_id: userId,
    email: email,
    password: hashedPassword
  }, {
    onConflict: 'user_id'
  })

if (credError) {
  console.log('❌ Credentials insert failed:', credError.message)
} else {
  console.log('✅ User credentials stored successfully')
}

console.log('\n🎉 Password fix complete!')
console.log('\n📌 Next steps:')
console.log('1. Refresh the app at http://localhost:3001')
console.log('2. Login with:')
console.log('   Email: pierre@phaetonai.com')
console.log('   Password: $Ineed1millie$_nexasync')
console.log('3. You should now have access!')
