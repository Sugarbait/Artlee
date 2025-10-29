/**
 * Check what data exists in the NEW database
 */

import { createClient } from '@supabase/supabase-js'

const NEW_DB = {
  url: 'https://fslniuhyunzlfcbxsiol.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
}

const newDb = createClient(NEW_DB.url, NEW_DB.serviceKey, { auth: { persistSession: false } })

async function checkTable(tableName) {
  console.log(`\n📊 ${tableName}:`)

  const { count, error } = await newDb
    .from(tableName)
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.log(`  ❌ Error: ${error.message}`)
    return
  }

  console.log(`  Total records: ${count || 0}`)

  // Get sample record
  const { data: sample } = await newDb.from(tableName).select('*').limit(3)
  if (sample && sample.length > 0) {
    console.log(`  Sample data:`)
    sample.forEach((record, i) => {
      console.log(`    ${i + 1}. ${record.email || record.title || record.id || 'Record'}`)
    })
  }
}

async function main() {
  console.log('🔍 Checking NEW Database (Current)')
  console.log('================================')
  console.log('Database:', NEW_DB.url)
  console.log('================================')

  const tables = [
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'system_credentials',
    'company_settings'
  ]

  for (const table of tables) {
    await checkTable(table)
  }

  console.log('\n================================')
  console.log('✅ Check complete')
}

main()
