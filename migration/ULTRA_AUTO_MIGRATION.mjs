/**
 * ARTLEE CRM - Ultra Automated Migration
 *
 * Attempts to execute SQL via Supabase REST API with service role
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import https from 'https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const OLD_DB = {
  url: 'https://cpkslvmydfdevdftieck.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0'
}

const NEW_DB = {
  url: 'https://fslniuhyunzlfcbxsiol.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
}

const TENANT_ID = 'artlee'

const oldDb = createClient(OLD_DB.url, OLD_DB.serviceKey, { auth: { persistSession: false } })
const newDb = createClient(NEW_DB.url, NEW_DB.serviceKey, { auth: { persistSession: false } })

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`) }
function logError(msg, err) { console.error(`[${new Date().toISOString()}] ❌ ${msg}`); if(err) console.error(err) }
function logSuccess(msg, count = null) { console.log(`✅ ${msg}${count !== null ? ` (${count} records)` : ''}`) }
async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function executeSqlViaApi(sql) {
  log('Attempting to execute SQL via Supabase API...')

  return new Promise((resolve, reject) => {
    const url = new URL(NEW_DB.url)
    const options = {
      hostname: url.hostname,
      path: '/rest/v1/rpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': NEW_DB.serviceKey,
        'Authorization': `Bearer ${NEW_DB.serviceKey}`
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(true)
        } else {
          resolve(false)
        }
      })
    })

    req.on('error', () => resolve(false))
    req.write(JSON.stringify({ query: sql }))
    req.end()
  })
}

async function checkTablesExist() {
  try {
    const { error } = await newDb.from('users').select('id').limit(1)
    return !error
  } catch {
    return false
  }
}

async function setupSchema() {
  console.log('\n🗄️  Schema Setup')
  console.log('===========================\n')

  if (await checkTablesExist()) {
    logSuccess('Tables already exist!')
    return true
  }

  log('Tables do not exist. Creating schema...')

  const sql = readFileSync(join(__dirname, '01_artlee_schema_creation.sql'), 'utf8')
  const executed = await executeSqlViaApi(sql)

  if (executed) {
    logSuccess('Schema created via API!')
    return true
  }

  // If API fails, show manual instructions
  console.log('\n⚠️  MANUAL SCHEMA SETUP REQUIRED')
  console.log('===================================')
  console.log('Run this SQL in Supabase dashboard:')
  console.log('')
  console.log('1. Open: https://fslniuhyunzlfcbxsiol.supabase.co')
  console.log('2. SQL Editor → New Query')
  console.log('3. Copy: migration/01_artlee_schema_creation.sql')
  console.log('4. Run, then re-run this script\n')

  process.exit(1)
}

async function migrateTable(table) {
  log(`📦 Migrating ${table}...`)

  try {
    const { data, error: fetchError } = await oldDb
      .from(table)
      .select('*')
      .eq('tenant_id', TENANT_ID)

    if (fetchError) throw fetchError
    if (!data || data.length === 0) {
      log(`⚠️  No ${table} records found`)
      return 0
    }

    log(`Found ${data.length} ${table} records`)

    const { error: insertError } = await newDb
      .from(table)
      .insert(data)

    if (insertError) throw insertError

    logSuccess(`${table} migrated`, data.length)
    return data.length
  } catch (error) {
    logError(`Failed to migrate ${table}`, error)
    throw error
  }
}

async function migrateAuditLogs() {
  log('📦 Migrating audit_logs (paginated)...')

  try {
    let allLogs = []
    let page = 0
    const pageSize = 1000

    while (true) {
      const { data, error } = await oldDb
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', TENANT_ID)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (!data || data.length === 0) break

      allLogs = allLogs.concat(data)
      log(`Fetched page ${page + 1} (${data.length} logs)`)

      if (data.length < pageSize) break
      page++
      await sleep(100)
    }

    if (allLogs.length === 0) {
      log('⚠️  No audit logs found')
      return 0
    }

    log(`Inserting ${allLogs.length} audit logs in batches...`)

    let inserted = 0
    for (let i = 0; i < allLogs.length; i += 1000) {
      const batch = allLogs.slice(i, i + 1000)
      const { error } = await newDb.from('audit_logs').insert(batch)
      if (error) throw error
      inserted += batch.length
      log(`Inserted batch ${Math.floor(i / 1000) + 1}`)
      await sleep(200)
    }

    logSuccess('Audit logs migrated', inserted)
    return inserted
  } catch (error) {
    logError('Failed to migrate audit_logs', error)
    throw error
  }
}

async function runMigration() {
  console.log('🚀 ARTLEE CRM - Ultra Automated Migration')
  console.log('==========================================')
  console.log(`Source: ${OLD_DB.url}`)
  console.log(`Target: ${NEW_DB.url}`)
  console.log(`Tenant: ${TENANT_ID}`)
  console.log('==========================================\n')

  const start = Date.now()

  try {
    await setupSchema()
    await sleep(1000)

    console.log('\n📦 Data Migration')
    console.log('===========================\n')

    const results = {
      users: await migrateTable('users'),
      user_settings: await migrateTable('user_settings'),
      user_profiles: await migrateTable('user_profiles'),
      audit_logs: await migrateAuditLogs(),
      notes: await migrateTable('notes'),
      system_credentials: await migrateTable('system_credentials'),
      company_settings: await migrateTable('company_settings')
    }

    const total = Object.values(results).reduce((a, b) => a + b, 0)
    const duration = ((Date.now() - start) / 1000).toFixed(2)

    console.log('\n==========================================')
    console.log('🎉 MIGRATION COMPLETE!')
    console.log('==========================================')
    console.log('Records Migrated:')
    Object.entries(results).forEach(([table, count]) => {
      console.log(`  ${table.padEnd(20)} ${count}`)
    })
    console.log(`\nTotal Records: ${total}`)
    console.log(`Duration: ${duration}s`)
    console.log('==========================================')
    console.log('\n📝 Next Steps:')
    console.log('  1. npm run dev')
    console.log('  2. Clear browser cache')
    console.log('  3. Test login')
    console.log('  4. Update GitHub secrets')
    console.log('  5. Deploy to artlee.nexasync.ca\n')

    process.exit(0)
  } catch (error) {
    console.error('\n==========================================')
    console.error('💥 MIGRATION FAILED')
    console.error('==========================================')
    logError('Error', error)
    process.exit(1)
  }
}

runMigration()
