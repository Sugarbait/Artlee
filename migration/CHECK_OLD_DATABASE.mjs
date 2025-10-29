/**
 * Check what data exists in the old database
 */

import { createClient } from '@supabase/supabase-js'

const OLD_DB = {
  url: 'https://cpkslvmydfdevdftieck.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'
}

const oldDb = createClient(OLD_DB.url, OLD_DB.serviceKey, { auth: { persistSession: false } })

async function checkTable(tableName) {
  console.log(`\n📊 ${tableName}:`)

  // Check total count
  const { data: all, error: allErr } = await oldDb.from(tableName).select('*', { count: 'exact', head: true })

  if (allErr) {
    console.log(`  ❌ Error: ${allErr.message}`)
    return
  }

  console.log(`  Total records: ${all?.length || 0}`)

  // Check with tenant_id filter
  const { data: artlee, error: artleeErr } = await oldDb
    .from(tableName)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', 'artlee')

  if (artleeErr) {
    console.log(`  ⚠️  No tenant_id column`)
  } else {
    console.log(`  ARTLEE records (tenant_id='artlee'): ${artlee?.length || 0}`)
  }

  // Get sample record to see structure
  const { data: sample } = await oldDb.from(tableName).select('*').limit(1)
  if (sample && sample[0]) {
    console.log(`  Sample columns:`, Object.keys(sample[0]).join(', '))
  }
}

async function main() {
  console.log('🔍 Checking Old Database')
  console.log('================================')
  console.log('Database:', OLD_DB.url)
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
