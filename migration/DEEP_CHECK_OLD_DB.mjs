/**
 * Deep check of old database - look for ANY data
 */

import { createClient } from '@supabase/supabase-js'

const OLD_DB = {
  url: 'https://cpkslvmydfdevdftieck.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'
}

const oldDb = createClient(OLD_DB.url, OLD_DB.serviceKey, { auth: { persistSession: false } })

async function deepCheck(tableName) {
  console.log(`\n📊 ${tableName}:`)

  // Get ALL records (no filter)
  const { data: all, error, count } = await oldDb
    .from(tableName)
    .select('*', { count: 'exact' })
    .limit(10)

  if (error) {
    console.log(`  ❌ Error: ${error.message}`)
    return
  }

  console.log(`  Total records in table: ${count || 0}`)

  if (all && all.length > 0) {
    console.log(`  Found ${all.length} records (showing first 10):`)

    all.forEach((record, i) => {
      const display = {
        email: record.email,
        tenant_id: record.tenant_id,
        id: record.id?.substring(0, 8) + '...',
        created_at: record.created_at?.substring(0, 10)
      }
      console.log(`    ${i + 1}.`, JSON.stringify(display, null, 2))
    })

    // Check tenant_id distribution
    if (all[0].tenant_id !== undefined) {
      const tenants = [...new Set(all.map(r => r.tenant_id))]
      console.log(`  Tenant IDs found:`, tenants)
    }
  } else {
    console.log(`  ⚠️  Table is EMPTY`)
  }
}

async function main() {
  console.log('🔍 DEEP CHECK - Old Database')
  console.log('================================')
  console.log('Database:', OLD_DB.url)
  console.log('Looking for ANY data (no filters)...')
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
    await deepCheck(table)
  }

  console.log('\n================================')
  console.log('✅ Deep check complete')
  console.log('\n💡 If all tables show 0 records:')
  console.log('   - Data may have been already migrated')
  console.log('   - Data may have been deleted')
  console.log('   - Wrong source database')
  console.log('================================\n')
}

main()
