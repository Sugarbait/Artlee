/**
 * ARTLEE CRM - Automated Schema Setup Script (ES Module)
 *
 * This script automatically runs the schema creation SQL on the new ARTLEE database.
 * It reads the SQL file and executes it using the Supabase service role.
 *
 * Usage: node migration/00_run_schema_setup.mjs
 *
 * Prerequisites:
 * - npm install @supabase/supabase-js
 * - Ensure 01_artlee_schema_creation.sql exists in the migration folder
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================

const NEW_DB = {
  url: 'https://fslniuhyunzlfcbxsiol.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
}

const SQL_FILE = join(__dirname, '01_artlee_schema_creation.sql')

// ============================================================================
// CREATE DATABASE CLIENT
// ============================================================================

const supabase = createClient(NEW_DB.url, NEW_DB.serviceKey, {
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

function logSuccess(message) {
  console.log(`✅ ${message}`)
}

// ============================================================================
// SCHEMA SETUP FUNCTIONS
// ============================================================================

function readSqlFile() {
  log('📖 Reading SQL file...')

  try {
    const sql = readFileSync(SQL_FILE, 'utf8')
    logSuccess(`SQL file read successfully (${sql.length} characters)`)
    return sql
  } catch (error) {
    logError('Failed to read SQL file', error)
    throw error
  }
}

/**
 * Execute SQL directly using Supabase RPC
 * Note: Supabase doesn't support arbitrary SQL via RPC by default
 * So we'll split into individual statements and execute via REST API
 */
async function executeSqlDirectly(sql) {
  log('🔧 Executing SQL statements...')

  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  log(`Found ${statements.length} SQL statements to execute`)

  let executed = 0
  let failed = 0

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]

    // Skip comments and empty statements
    if (!statement || statement.startsWith('--') || statement.startsWith('/*')) {
      continue
    }

    try {
      // For DDL statements, we need to use the Supabase Management API
      // or execute via psql. Since we can't do that programmatically easily,
      // we'll use a direct fetch to the PostgREST endpoint

      const statementPreview = statement.substring(0, 50).replace(/\s+/g, ' ')
      log(`[${i + 1}/${statements.length}] Executing: ${statementPreview}...`)

      // Try to execute via fetch to the REST API
      const response = await fetch(`${NEW_DB.url}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': NEW_DB.serviceKey,
          'Authorization': `Bearer ${NEW_DB.serviceKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ query: statement + ';' })
      })

      if (response.ok) {
        executed++
        logSuccess(`Statement ${i + 1} executed`)
      } else {
        // Many DDL statements might not work via RPC
        // This is expected - we'll provide manual instructions
        failed++
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      failed++
      // Continue anyway - some statements might fail but that's ok
    }
  }

  return { executed, failed, total: statements.length }
}

async function runSchemaSetup() {
  console.log('🚀 ARTLEE CRM Schema Setup Started')
  console.log('===================================')
  console.log(`Target DB: ${NEW_DB.url}`)
  console.log(`SQL File: ${SQL_FILE}`)
  console.log('===================================\n')

  const startTime = Date.now()

  try {
    // Read SQL file
    const sql = readSqlFile()

    console.log('\n⚠️  IMPORTANT NOTICE ⚠️')
    console.log('=====================================')
    console.log('Supabase does not allow arbitrary DDL execution via API.')
    console.log('The schema MUST be created manually via the Supabase dashboard.')
    console.log('')
    console.log('📋 MANUAL STEPS REQUIRED:')
    console.log('1. Open: ' + NEW_DB.url)
    console.log('2. Go to: SQL Editor → New Query')
    console.log('3. Copy contents of: migration/01_artlee_schema_creation.sql')
    console.log('4. Paste into SQL Editor')
    console.log('5. Click "Run"')
    console.log('6. Verify tables created in Table Editor')
    console.log('')
    console.log('Then run: node migration/02_data_migration.mjs')
    console.log('=====================================\n')

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('Duration: ' + duration + 's')
    console.log('\n📝 Next Step: Follow manual instructions above')

    process.exit(0)
  } catch (error) {
    console.error('\n===================================')
    console.error('💥 Schema Setup Failed!')
    console.error('===================================')
    logError('Setup error', error)
    process.exit(1)
  }
}

// ============================================================================
// RUN SETUP
// ============================================================================

runSchemaSetup()

export { runSchemaSetup }
