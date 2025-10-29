/**
 * Check if old database has ARTLEE data with tenant_id='artlee'
 */

import { createClient } from '@supabase/supabase-js'

const OLD_DB = {
  url: 'https://cpkslvmydfdevdftieck.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'
}

const oldDb = createClient(OLD_DB.url, OLD_DB.serviceKey, { auth: { persistSession: false } })

async function checkArtleeData() {
  console.log('🔍 Checking Old Database for ARTLEE Data')
  console.log('==========================================')
  console.log('Database:', OLD_DB.url)
  console.log('Filter: tenant_id = "artlee"')
  console.log('==========================================\n')

  const tables = ['users', 'user_settings', 'audit_logs', 'notes']
  let hasArtleeData = false

  for (const table of tables) {
    try {
      // Try with tenant_id filter
      const { count, error } = await oldDb
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', 'artlee')

      if (!error && count > 0) {
        console.log(`✅ ${table}: ${count} ARTLEE records found`)
        hasArtleeData = true
      } else {
        console.log(`⚠️  ${table}: 0 ARTLEE records`)
      }
    } catch (err) {
      console.log(`❌ ${table}: Error -`, err.message)
    }
  }

  console.log('\n==========================================')

  if (hasArtleeData) {
    console.log('🎯 RESULT: ARTLEE data found!')
    console.log('   → Migration needed')
    console.log('   → Run data migration script after schema fix')
  } else {
    console.log('📭 RESULT: No ARTLEE data found')
    console.log('   → This appears to be a fresh installation')
    console.log('   → Or ARTLEE data is in a different database')
    console.log('   → No migration needed - ready to use!')
  }

  console.log('==========================================\n')
}

checkArtleeData()
