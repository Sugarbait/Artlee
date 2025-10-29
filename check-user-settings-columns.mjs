#!/usr/bin/env node

/**
 * Check user_settings table schema
 * This verifies if api_key_updated_at column exists
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing')
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseKey ? '✅ Set' : '❌ Missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Checking user_settings table schema...')
console.log('📊 Supabase Project:', supabaseUrl)

try {
  // Query the table to see what columns are returned
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .limit(1)

  if (error) {
    console.error('❌ Error querying user_settings:', error.message)
    process.exit(1)
  }

  console.log('\n✅ Successfully queried user_settings table')

  if (data && data.length > 0) {
    console.log('\n📋 Available columns:')
    const columns = Object.keys(data[0])
    columns.forEach(col => {
      console.log(`  - ${col}`)
    })

    // Check for specific columns
    console.log('\n🔎 Checking required columns:')
    const requiredColumns = [
      'api_key_updated_at',
      'retell_config',
      'encrypted_api_keys',
      'tenant_id',
      'user_id'
    ]

    requiredColumns.forEach(col => {
      const exists = columns.includes(col)
      console.log(`  ${exists ? '✅' : '❌'} ${col}`)
    })
  } else {
    console.log('\n⚠️ No records found in user_settings table')
    console.log('   Cannot determine schema without at least one record')

    // Try to get schema from information_schema (if service role key available)
    console.log('\n📋 Attempting to query table schema directly...')
    const { data: schemaData, error: schemaError } = await supabase
      .rpc('get_table_columns', { table_name: 'user_settings' })
      .catch(() => ({ data: null, error: { message: 'Function not available' } }))

    if (schemaError) {
      console.log('   ⚠️ Cannot query schema directly:', schemaError.message)
    }
  }

} catch (err) {
  console.error('❌ Unexpected error:', err.message)
  process.exit(1)
}

console.log('\n✅ Schema check complete')
