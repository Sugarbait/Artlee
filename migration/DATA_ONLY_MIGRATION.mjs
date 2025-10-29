/**
 * ARTLEE CRM - Data Migration Only
 *
 * Assumes schema already exists, migrates data only.
 * Run this after executing 01_artlee_schema_creation.sql in Supabase dashboard.
 */

import { createClient } from '@supabase/supabase-js'

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

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`)
const success = (msg, count) => console.log(`✅ ${msg}${count ? ` (${count} records)` : ''}`)
const error = (msg, err) => { console.error(`❌ ${msg}`); if(err) console.error(err) }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function migrateTable(table) {
  log(`Migrating ${table}...`)

  const { data, error: fetchErr } = await oldDb.from(table).select('*').eq('tenant_id', TENANT_ID)

  if (fetchErr) throw fetchErr
  if (!data || !data.length) {
    log(`⚠️  No ${table} records found`)
    return 0
  }

  log(`Found ${data.length} records`)
  const { error: insertErr } = await newDb.from(table).insert(data)
  if (insertErr) throw insertErr

  success(`${table}`, data.length)
  return data.length
}

async function migrateAuditLogs() {
  log('Migrating audit_logs (paginated)...')

  let all = [], page = 0, size = 1000

  while (true) {
    const { data, error: err } = await oldDb
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .range(page * size, (page + 1) * size - 1)
      .order('created_at')

    if (err) throw err
    if (!data || !data.length) break

    all = all.concat(data)
    log(`Page ${page + 1}: ${data.length} records`)

    if (data.length < size) break
    page++
    await sleep(100)
  }

  if (!all.length) {
    log('⚠️  No audit logs found')
    return 0
  }

  log(`Inserting ${all.length} audit logs...`)

  for (let i = 0; i < all.length; i += 1000) {
    const { error: err } = await newDb.from('audit_logs').insert(all.slice(i, i + 1000))
    if (err) throw err
    log(`Batch ${Math.floor(i/1000) + 1}`)
    await sleep(200)
  }

  success('audit_logs', all.length)
  return all.length
}

async function main() {
  console.log('\n🚀 ARTLEE Data Migration')
  console.log('================================')
  console.log(`Source: ${OLD_DB.url}`)
  console.log(`Target: ${NEW_DB.url}`)
  console.log(`Tenant: ${TENANT_ID}\n`)

  const start = Date.now()

  try {
    // Verify schema exists
    log('Verifying schema...')
    const { error: schemaErr } = await newDb.from('users').select('id').limit(1)

    if (schemaErr) {
      console.error('\n❌ SCHEMA NOT FOUND')
      console.error('================================')
      console.error('Please run the schema SQL first:')
      console.error('')
      console.error('1. Open: https://fslniuhyunzlfcbxsiol.supabase.co')
      console.error('2. SQL Editor → New Query')
      console.error('3. Copy: migration/01_artlee_schema_creation.sql')
      console.error('4. Run, then retry this script\n')
      process.exit(1)
    }

    success('Schema verified')

    console.log('\n📦 Migrating Data...\n')

    const results = {
      users: await migrateTable('users'),
      user_settings: await migrateTable('user_settings'),
      user_profiles: await migrateTable('user_profiles'),
      audit_logs: await migrateAuditLogs(),
      notes: await migrateTable('notes'),
      system_credentials: await migrateTable('system_credentials'),
      company_settings: await migrateTable('company_settings')
    }

    const total = Object.values(results).reduce((a,b) => a+b, 0)
    const time = ((Date.now() - start) / 1000).toFixed(2)

    console.log('\n================================')
    console.log('🎉 MIGRATION COMPLETE!')
    console.log('================================')
    Object.entries(results).forEach(([t, c]) => console.log(`  ${t.padEnd(20)} ${c}`))
    console.log(`\nTotal: ${total} records`)
    console.log(`Time: ${time}s`)
    console.log('================================')
    console.log('\n📝 Next Steps:')
    console.log('  1. npm run dev')
    console.log('  2. Clear browser cache')
    console.log('  3. Test at localhost:3000')
    console.log('  4. Update GitHub secrets')
    console.log('  5. Deploy to artlee.nexasync.ca\n')

    process.exit(0)
  } catch (err) {
    console.error('\n💥 MIGRATION FAILED')
    console.error('================================')
    error('Error:', err)
    console.error('\nSee ROLLBACK_PROCEDURES.md for recovery\n')
    process.exit(1)
  }
}

main()
