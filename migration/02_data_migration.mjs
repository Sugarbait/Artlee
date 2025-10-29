/**
 * ARTLEE CRM - Data Migration Script (ES Module)
 *
 * This script migrates ARTLEE tenant data from the old shared database
 * to the new dedicated ARTLEE database.
 *
 * Usage: node migration/02_data_migration.mjs
 *
 * Prerequisites:
 * - npm install @supabase/supabase-js
 * - Backup old database before running
 * - Run 01_artlee_schema_creation.sql on new database first
 */

import { createClient } from '@supabase/supabase-js'

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================

// Old shared database (source)
const OLD_DB = {
  url: 'https://cpkslvmydfdevdftieck.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY5MDAyOTUsImV4cCI6MjA2MjQ3NjI5NX0.IfkIVsp3AtLOyXDW9hq9bEvnozd9IaaUay244iDhWGE',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'
}

// New ARTLEE database (destination)
const NEW_DB = {
  url: 'https://fslniuhyunzlfcbxsiol.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTA1MTAsImV4cCI6MjA3NTU4NjUxMH0.1_ln5Dt5p1tagxWwGH77cp9U2nLky6xfHG77VGEgQiI',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
}

// Tenant ID to migrate
const TENANT_ID = 'artlee'

// ============================================================================
// CREATE DATABASE CLIENTS
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

function log(message, data = null) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
  if (data) {
    console.log(JSON.stringify(data, null, 2))
  }
}

function logError(message, error) {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] ❌ ERROR: ${message}`)
  console.error(error)
}

function logSuccess(message, count = null) {
  const countStr = count !== null ? ` (${count} records)` : ''
  console.log(`✅ ${message}${countStr}`)
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

async function migrateUsers() {
  log('📦 Migrating users table...')

  try {
    const { data: users, error: fetchError } = await oldDb
      .from('users')
      .select('*')
      .eq('tenant_id', TENANT_ID)

    if (fetchError) {
      throw fetchError
    }

    if (!users || users.length === 0) {
      log('⚠️  No users found with tenant_id = artlee')
      return 0
    }

    log(`Found ${users.length} users to migrate`)

    const { data: inserted, error: insertError } = await newDb
      .from('users')
      .insert(users)
      .select()

    if (insertError) {
      throw insertError
    }

    logSuccess('Users migrated', users.length)
    return users.length
  } catch (error) {
    logError('Failed to migrate users', error)
    throw error
  }
}

async function migrateUserSettings() {
  log('📦 Migrating user_settings table...')

  try {
    const { data: settings, error: fetchError } = await oldDb
      .from('user_settings')
      .select('*')
      .eq('tenant_id', TENANT_ID)

    if (fetchError) {
      throw fetchError
    }

    if (!settings || settings.length === 0) {
      log('⚠️  No user settings found with tenant_id = artlee')
      return 0
    }

    log(`Found ${settings.length} user settings to migrate`)

    const { data: inserted, error: insertError } = await newDb
      .from('user_settings')
      .insert(settings)
      .select()

    if (insertError) {
      throw insertError
    }

    logSuccess('User settings migrated', settings.length)
    return settings.length
  } catch (error) {
    logError('Failed to migrate user_settings', error)
    throw error
  }
}

async function migrateUserProfiles() {
  log('📦 Migrating user_profiles table...')

  try {
    const { data: profiles, error: fetchError } = await oldDb
      .from('user_profiles')
      .select('*')
      .eq('tenant_id', TENANT_ID)

    if (fetchError) {
      throw fetchError
    }

    if (!profiles || profiles.length === 0) {
      log('⚠️  No user profiles found with tenant_id = artlee')
      return 0
    }

    log(`Found ${profiles.length} user profiles to migrate`)

    const { data: inserted, error: insertError } = await newDb
      .from('user_profiles')
      .insert(profiles)
      .select()

    if (insertError) {
      throw insertError
    }

    logSuccess('User profiles migrated', profiles.length)
    return profiles.length
  } catch (error) {
    logError('Failed to migrate user_profiles', error)
    throw error
  }
}

async function migrateAuditLogs() {
  log('📦 Migrating audit_logs table...')

  try {
    let allLogs = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      const { data: logs, error: fetchError } = await oldDb
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', TENANT_ID)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('created_at', { ascending: true })

      if (fetchError) {
        throw fetchError
      }

      if (!logs || logs.length === 0) {
        hasMore = false
        break
      }

      allLogs = allLogs.concat(logs)
      log(`Fetched page ${page + 1} (${logs.length} audit logs)`)

      if (logs.length < pageSize) {
        hasMore = false
      }

      page++
      await sleep(100)
    }

    if (allLogs.length === 0) {
      log('⚠️  No audit logs found with tenant_id = artlee')
      return 0
    }

    log(`Found ${allLogs.length} audit logs to migrate`)

    const batchSize = 1000
    let totalInserted = 0

    for (let i = 0; i < allLogs.length; i += batchSize) {
      const batch = allLogs.slice(i, i + batchSize)

      const { data: inserted, error: insertError } = await newDb
        .from('audit_logs')
        .insert(batch)
        .select()

      if (insertError) {
        throw insertError
      }

      totalInserted += batch.length
      log(`Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} audit logs)`)
      await sleep(200)
    }

    logSuccess('Audit logs migrated', totalInserted)
    return totalInserted
  } catch (error) {
    logError('Failed to migrate audit_logs', error)
    throw error
  }
}

async function migrateNotes() {
  log('📦 Migrating notes table...')

  try {
    const { data: notes, error: fetchError } = await oldDb
      .from('notes')
      .select('*')
      .eq('tenant_id', TENANT_ID)

    if (fetchError) {
      throw fetchError
    }

    if (!notes || notes.length === 0) {
      log('⚠️  No notes found with tenant_id = artlee')
      return 0
    }

    log(`Found ${notes.length} notes to migrate`)

    const { data: inserted, error: insertError } = await newDb
      .from('notes')
      .insert(notes)
      .select()

    if (insertError) {
      throw insertError
    }

    logSuccess('Notes migrated', notes.length)
    return notes.length
  } catch (error) {
    logError('Failed to migrate notes', error)
    throw error
  }
}

async function migrateSystemCredentials() {
  log('📦 Migrating system_credentials table...')

  try {
    const { data: credentials, error: fetchError } = await oldDb
      .from('system_credentials')
      .select('*')
      .eq('tenant_id', TENANT_ID)

    if (fetchError) {
      throw fetchError
    }

    if (!credentials || credentials.length === 0) {
      log('⚠️  No system credentials found with tenant_id = artlee')
      return 0
    }

    log(`Found ${credentials.length} system credentials to migrate`)

    const { data: inserted, error: insertError } = await newDb
      .from('system_credentials')
      .insert(credentials)
      .select()

    if (insertError) {
      throw insertError
    }

    logSuccess('System credentials migrated', credentials.length)
    return credentials.length
  } catch (error) {
    logError('Failed to migrate system_credentials', error)
    throw error
  }
}

async function migrateCompanySettings() {
  log('📦 Migrating company_settings table...')

  try {
    const { data: settings, error: fetchError } = await oldDb
      .from('company_settings')
      .select('*')
      .eq('tenant_id', TENANT_ID)

    if (fetchError) {
      throw fetchError
    }

    if (!settings || settings.length === 0) {
      log('⚠️  No company settings found with tenant_id = artlee')
      return 0
    }

    log(`Found ${settings.length} company settings to migrate`)

    const { data: inserted, error: insertError } = await newDb
      .from('company_settings')
      .insert(settings)
      .select()

    if (insertError) {
      throw insertError
    }

    logSuccess('Company settings migrated', settings.length)
    return settings.length
  } catch (error) {
    logError('Failed to migrate company_settings', error)
    throw error
  }
}

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

async function runMigration() {
  console.log('🚀 ARTLEE CRM Data Migration Started')
  console.log('=====================================')
  console.log(`Source DB: ${OLD_DB.url}`)
  console.log(`Target DB: ${NEW_DB.url}`)
  console.log(`Tenant ID: ${TENANT_ID}`)
  console.log('=====================================\n')

  const startTime = Date.now()
  const results = {
    users: 0,
    userSettings: 0,
    userProfiles: 0,
    auditLogs: 0,
    notes: 0,
    systemCredentials: 0,
    companySettings: 0
  }

  try {
    results.users = await migrateUsers()
    await sleep(500)

    results.userSettings = await migrateUserSettings()
    await sleep(500)

    results.userProfiles = await migrateUserProfiles()
    await sleep(500)

    results.auditLogs = await migrateAuditLogs()
    await sleep(500)

    results.notes = await migrateNotes()
    await sleep(500)

    results.systemCredentials = await migrateSystemCredentials()
    await sleep(500)

    results.companySettings = await migrateCompanySettings()

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('\n=====================================')
    console.log('🎉 Migration Completed Successfully!')
    console.log('=====================================')
    console.log('Records Migrated:')
    console.log(`  Users:              ${results.users}`)
    console.log(`  User Settings:      ${results.userSettings}`)
    console.log(`  User Profiles:      ${results.userProfiles}`)
    console.log(`  Audit Logs:         ${results.auditLogs}`)
    console.log(`  Notes:              ${results.notes}`)
    console.log(`  System Credentials: ${results.systemCredentials}`)
    console.log(`  Company Settings:   ${results.companySettings}`)
    console.log(`\nTotal Records:        ${Object.values(results).reduce((a, b) => a + b, 0)}`)
    console.log(`Duration:             ${duration}s`)
    console.log('=====================================')

    process.exit(0)
  } catch (error) {
    console.error('\n=====================================')
    console.error('💥 Migration Failed!')
    console.error('=====================================')
    logError('Migration error', error)
    console.error('\nPlease review the error above and retry.')
    console.error('If data was partially migrated, you may need to clean the new database before retrying.')
    process.exit(1)
  }
}

// Run migration
runMigration()

export { runMigration }
