/**
 * ARTLEE CRM - Complete Automated Migration
 *
 * This master script runs the entire migration process automatically.
 *
 * Usage: node migration/RUN_MIGRATION.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import * as readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================

const OLD_DB = {
  url: 'https://cpkslvmydfdevdftieck.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'
}

const NEW_DB = {
  url: 'https://fslniuhyunzlfcbxsiol.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTA1MTAsImV4cCI6MjA3NTU4NjUxMH0.1_ln5Dt5p1tagxWwGH77cp9U2nLky6xfHG77VGEgQiI',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
}

const TENANT_ID = 'artlee'
const SQL_FILE = join(__dirname, '01_artlee_schema_creation.sql')

// ============================================================================
// DATABASE CLIENTS
// ============================================================================

const oldDb = createClient(OLD_DB.url, OLD_DB.serviceKey, {
  auth: { persistSession: false }
})

const newDb = createClient(NEW_DB.url, NEW_DB.serviceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function logError(message, error) {
  console.error(`[${new Date().toISOString()}] ❌ ERROR: ${message}`)
  if (error) console.error(error)
}

function logSuccess(message, count = null) {
  const countStr = count !== null ? ` (${count} records)` : ''
  console.log(`✅ ${message}${countStr}`)
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.toLowerCase().trim())
    })
  })
}

// ============================================================================
// SCHEMA SETUP
// ============================================================================

async function setupSchema() {
  console.log('\n🗄️  STEP 1: Schema Setup')
  console.log('=====================================')

  // Check if tables already exist
  log('Checking if tables already exist...')

  const { data: existingTables, error } = await newDb
    .from('users')
    .select('id')
    .limit(1)

  if (!error && existingTables !== null) {
    console.log('✅ Tables already exist! Skipping schema creation.')
    return true
  }

  // Tables don't exist - need to create them
  console.log('\n📋 MANUAL STEP REQUIRED:')
  console.log('=====================================')
  console.log('Please open your Supabase dashboard and run the schema SQL:')
  console.log('')
  console.log('1. Open: https://fslniuhyunzlfcbxsiol.supabase.co')
  console.log('2. Go to: SQL Editor → New Query')
  console.log('3. Copy the entire contents of:')
  console.log('   migration/01_artlee_schema_creation.sql')
  console.log('4. Paste into SQL Editor')
  console.log('5. Click "Run" button')
  console.log('6. Verify success message')
  console.log('=====================================\n')

  const answer = await askQuestion('Have you completed the schema setup? (yes/no): ')

  if (answer === 'yes' || answer === 'y') {
    // Verify tables exist
    const { error: verifyError } = await newDb
      .from('users')
      .select('id')
      .limit(1)

    if (verifyError) {
      logError('Schema verification failed', verifyError)
      console.error('\n⚠️  Tables not found. Please run the schema SQL first.')
      process.exit(1)
    }

    logSuccess('Schema setup verified!')
    return true
  } else {
    console.log('\n⚠️  Schema setup cancelled. Please run the schema SQL first.')
    process.exit(0)
  }
}

// ============================================================================
// DATA MIGRATION
// ============================================================================

async function migrateData(tableName, sourceClient, targetClient) {
  log(`📦 Migrating ${tableName}...`)

  try {
    const { data: records, error: fetchError } = await sourceClient
      .from(tableName)
      .select('*')
      .eq('tenant_id', TENANT_ID)

    if (fetchError) throw fetchError

    if (!records || records.length === 0) {
      log(`⚠️  No ${tableName} found with tenant_id = artlee`)
      return 0
    }

    log(`Found ${records.length} ${tableName} to migrate`)

    const { error: insertError } = await targetClient
      .from(tableName)
      .insert(records)

    if (insertError) throw insertError

    logSuccess(`${tableName} migrated`, records.length)
    return records.length
  } catch (error) {
    logError(`Failed to migrate ${tableName}`, error)
    throw error
  }
}

async function migrateAuditLogs() {
  log('📦 Migrating audit_logs...')

  try {
    let allLogs = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      const { data: logs, error } = await oldDb
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', TENANT_ID)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('created_at', { ascending: true })

      if (error) throw error

      if (!logs || logs.length === 0) break

      allLogs = allLogs.concat(logs)
      log(`Fetched page ${page + 1} (${logs.length} audit logs)`)

      if (logs.length < pageSize) hasMore = false
      page++
      await sleep(100)
    }

    if (allLogs.length === 0) {
      log('⚠️  No audit logs found')
      return 0
    }

    log(`Found ${allLogs.length} audit logs to migrate`)

    // Insert in batches
    const batchSize = 1000
    let totalInserted = 0

    for (let i = 0; i < allLogs.length; i += batchSize) {
      const batch = allLogs.slice(i, i + batchSize)
      const { error } = await newDb.from('audit_logs').insert(batch)

      if (error) throw error

      totalInserted += batch.length
      log(`Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} logs)`)
      await sleep(200)
    }

    logSuccess('Audit logs migrated', totalInserted)
    return totalInserted
  } catch (error) {
    logError('Failed to migrate audit_logs', error)
    throw error
  }
}

async function runDataMigration() {
  console.log('\n📦 STEP 2: Data Migration')
  console.log('=====================================\n')

  const results = {
    users: 0,
    user_settings: 0,
    user_profiles: 0,
    audit_logs: 0,
    notes: 0,
    system_credentials: 0,
    company_settings: 0
  }

  try {
    results.users = await migrateData('users', oldDb, newDb)
    await sleep(500)

    results.user_settings = await migrateData('user_settings', oldDb, newDb)
    await sleep(500)

    results.user_profiles = await migrateData('user_profiles', oldDb, newDb)
    await sleep(500)

    results.audit_logs = await migrateAuditLogs()
    await sleep(500)

    results.notes = await migrateData('notes', oldDb, newDb)
    await sleep(500)

    results.system_credentials = await migrateData('system_credentials', oldDb, newDb)
    await sleep(500)

    results.company_settings = await migrateData('company_settings', oldDb, newDb)

    return results
  } catch (error) {
    logError('Data migration failed', error)
    throw error
  }
}

// ============================================================================
// MAIN MIGRATION
// ============================================================================

async function runCompleteMigration() {
  console.log('🚀 ARTLEE CRM - Complete Database Migration')
  console.log('============================================')
  console.log(`Source DB: ${OLD_DB.url}`)
  console.log(`Target DB: ${NEW_DB.url}`)
  console.log(`Tenant ID: ${TENANT_ID}`)
  console.log('============================================\n')

  const startTime = Date.now()

  try {
    // Step 1: Setup Schema
    await setupSchema()
    await sleep(1000)

    // Step 2: Migrate Data
    const results = await runDataMigration()

    // Calculate duration
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Print summary
    console.log('\n============================================')
    console.log('🎉 Migration Completed Successfully!')
    console.log('============================================')
    console.log('Records Migrated:')
    console.log(`  Users:              ${results.users}`)
    console.log(`  User Settings:      ${results.user_settings}`)
    console.log(`  User Profiles:      ${results.user_profiles}`)
    console.log(`  Audit Logs:         ${results.audit_logs}`)
    console.log(`  Notes:              ${results.notes}`)
    console.log(`  System Credentials: ${results.system_credentials}`)
    console.log(`  Company Settings:   ${results.company_settings}`)
    console.log(`\nTotal Records:        ${Object.values(results).reduce((a, b) => a + b, 0)}`)
    console.log(`Duration:             ${duration}s`)
    console.log('============================================')
    console.log('\n📝 Next Steps:')
    console.log('  1. Test locally: npm run dev')
    console.log('  2. Clear browser cache')
    console.log('  3. Test login and data access')
    console.log('  4. Deploy to production')
    console.log('============================================\n')

    process.exit(0)
  } catch (error) {
    console.error('\n============================================')
    console.error('💥 Migration Failed!')
    console.error('============================================')
    logError('Migration error', error)
    console.error('\nPlease review the error and retry.')
    console.error('See migration/ROLLBACK_PROCEDURES.md for rollback instructions.')
    process.exit(1)
  }
}

// Run migration
runCompleteMigration()
