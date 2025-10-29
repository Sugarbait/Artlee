import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = 'https://cpkslvmydfdevdftieck.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const password = '$Ineed1millie$_nexasync'
const email = 'pierre@phaetonai.com'
const userId = 'ee8f5c7a-06da-45d0-910b-12bc35ae70db'

console.log('🔐 Storing credentials in user_credentials table...\n')

// Hash the password
const salt = await bcrypt.genSalt(10)
const hashedPassword = await bcrypt.hash(password, salt)

// Try regular insert first
const { data: credData, error: credError } = await supabase
  .from('user_credentials')
  .insert({
    user_id: userId,
    email: email,
    password: hashedPassword
  })

if (credError) {
  console.log('❌ Insert failed:', credError.message)
  console.log('Trying update instead...')

  // Try update
  const { data: updateData, error: updateError } = await supabase
    .from('user_credentials')
    .update({ password: hashedPassword })
    .eq('user_id', userId)

  if (updateError) {
    console.log('❌ Update failed:', updateError.message)
  } else {
    console.log('✅ Credentials updated successfully')
  }
} else {
  console.log('✅ Credentials inserted successfully')
}

console.log('\n✨ Done! Try logging in now.')
