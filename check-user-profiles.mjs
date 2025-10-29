#!/usr/bin/env node

/**
 * Check user_profiles table for ARTLEE user
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Checking user_profiles table for ARTLEE users...')

try {
  // Query user_profiles for ARTLEE tenant
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, tenant_id, encrypted_retell_api_key, encrypted_agent_config')
    .eq('tenant_id', 'artlee')

  if (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }

  console.log(`\n✅ Found ${data.length} ARTLEE user profile(s)`)

  if (data.length > 0) {
    data.forEach((profile, index) => {
      console.log(`\n📋 Profile ${index + 1}:`)
      console.log(`  User ID: ${profile.user_id}`)
      console.log(`  Tenant: ${profile.tenant_id}`)
      console.log(`  Has API Key: ${profile.encrypted_retell_api_key ? '✅ Yes' : '❌ No'}`)
      console.log(`  Has Agent Config: ${profile.encrypted_agent_config ? '✅ Yes' : '❌ No'}`)

      if (profile.encrypted_agent_config) {
        console.log(`  Agent Config:`, profile.encrypted_agent_config)
      }
    })

    console.log('\n📋 Available columns in user_profiles:')
    const columns = Object.keys(data[0])
    columns.forEach(col => {
      console.log(`  - ${col}`)
    })
  } else {
    console.log('\n⚠️ No ARTLEE user profiles found')
    console.log('   This is normal if no credentials have been saved yet')
  }

} catch (err) {
  console.error('❌ Unexpected error:', err.message)
  process.exit(1)
}
