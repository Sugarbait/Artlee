/**
 * ARTLEE CRM - Fully Automated Schema Setup
 *
 * This script connects directly to PostgreSQL and runs the schema SQL automatically.
 *
 * Usage: node migration/01_run_schema_automated.mjs
 *
 * Prerequisites:
 * - npm install pg
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Client } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================

// Extract database credentials from Supabase URL
const SUPABASE_URL = 'https://fslniuhyunzlfcbxsiol.supabase.co'
const PROJECT_REF = 'fslniuhyunzlfcbxsiol'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'

// Supabase PostgreSQL connection
// Note: You'll need the database password from Supabase dashboard
const DB_CONFIG = {
  host: `db.${PROJECT_REF}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  // Password needs to be set - get from Supabase dashboard > Project Settings > Database
  password: process.env.SUPABASE_DB_PASSWORD || ''
}

const SQL_FILE = join(__dirname, '01_artlee_schema_creation.sql')

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

function logError(message, error) {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] ❌ ERROR: ${message}`)
  console.error(error)
}

function logSuccess(message) {
  console.log(`✅ ${message}`)
}

// ============================================================================
// SCHEMA SETUP
// ============================================================================

async function runSchemaSetup() {
  console.log('🚀 ARTLEE CRM - Automated Schema Setup')
  console.log('=====================================')
  console.log(`Database: ${DB_CONFIG.host}`)
  console.log(`SQL File: ${SQL_FILE}`)
  console.log('=====================================\n')

  // Check if password is set
  if (!DB_CONFIG.password) {
    console.error('❌ ERROR: Database password not provided!')
    console.error('')
    console.error('Please provide the database password in one of these ways:')
    console.error('')
    console.error('1. Set environment variable:')
    console.error('   export SUPABASE_DB_PASSWORD="your-db-password"')
    console.error('   node migration/01_run_schema_automated.mjs')
    console.error('')
    console.error('2. Or get password from:')
    console.error('   https://fslniuhyunzlfcbxsiol.supabase.co')
    console.error('   → Project Settings → Database → Connection string')
    console.error('')
    console.error('⚠️  RECOMMENDED: Use manual SQL execution instead:')
    console.error('   1. Open Supabase dashboard SQL Editor')
    console.error('   2. Copy migration/01_artlee_schema_creation.sql')
    console.error('   3. Paste and Run')
    console.error('')
    process.exit(1)
  }

  const client = new Client(DB_CONFIG)

  try {
    // Read SQL file
    log('📖 Reading SQL file...')
    const sql = readFileSync(SQL_FILE, 'utf8')
    logSuccess(`SQL file read (${sql.length} characters)`)

    // Connect to database
    log('🔌 Connecting to PostgreSQL...')
    await client.connect()
    logSuccess('Connected to database')

    // Execute SQL
    log('🔧 Executing schema creation SQL...')
    await client.query(sql)
    logSuccess('Schema created successfully')

    // Verify tables
    log('✔️  Verifying tables...')
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'user_settings', 'user_profiles', 'audit_logs', 'notes', 'system_credentials', 'company_settings')
      ORDER BY table_name
    `)

    console.log(`\nTables created: ${result.rows.length}/7`)
    result.rows.forEach(row => console.log(`  ✅ ${row.table_name}`))

    console.log('\n=====================================')
    console.log('🎉 Schema Setup Complete!')
    console.log('=====================================')
    console.log('\n📝 Next Step:')
    console.log('   node migration/02_data_migration.mjs')
    console.log('=====================================\n')

    process.exit(0)

  } catch (error) {
    logError('Schema setup failed', error)
    console.error('\n⚠️  MANUAL SETUP REQUIRED:')
    console.error('Please run the SQL manually:')
    console.error('1. Open: https://fslniuhyunzlfcbxsiol.supabase.co')
    console.error('2. Go to: SQL Editor → New Query')
    console.error('3. Copy: migration/01_artlee_schema_creation.sql')
    console.error('4. Paste and Run')
    console.error('')
    process.exit(1)
  } finally {
    await client.end()
  }
}

// Run setup
runSchemaSetup()
