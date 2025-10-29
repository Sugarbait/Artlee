/**
 * ARTLEE CRM - Automated Schema Setup Script
 *
 * This script automatically runs the schema creation SQL on the new ARTLEE database.
 * It reads the SQL file and executes it using the Supabase service role.
 *
 * Usage: node migration/00_run_schema_setup.js
 *
 * Prerequisites:
 * - npm install @supabase/supabase-js
 * - Ensure 01_artlee_schema_creation.sql exists in the migration folder
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================

const NEW_DB = {
  url: 'https://fslniuhyunzlfcbxsiol.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
}

const SQL_FILE = path.join(__dirname, '01_artlee_schema_creation.sql')

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

async function readSqlFile() {
  log('📖 Reading SQL file...')

  try {
    if (!fs.existsSync(SQL_FILE)) {
      throw new Error(`SQL file not found: ${SQL_FILE}`)
    }

    const sql = fs.readFileSync(SQL_FILE, 'utf8')
    logSuccess(`SQL file read successfully (${sql.length} characters)`)
    return sql
  } catch (error) {
    logError('Failed to read SQL file', error)
    throw error
  }
}

/**
 * Split SQL into individual statements
 * Supabase RPC can handle one statement at a time
 */
function splitSqlStatements(sql) {
  log('✂️  Splitting SQL into statements...')

  // Remove comments
  let cleaned = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')

  // Split by semicolons, but be careful with strings and DO blocks
  const statements = []
  let current = ''
  let inDoBlock = false
  let inString = false
  let stringChar = null

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i]
    const prev = i > 0 ? cleaned[i - 1] : ''
    const next = i < cleaned.length - 1 ? cleaned[i + 1] : ''

    // Track string literals
    if ((char === "'" || char === '"') && prev !== '\\') {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        inString = false
        stringChar = null
      }
    }

    // Track DO blocks
    if (!inString) {
      if (char === 'D' && next === 'O' && cleaned.substr(i, 4) === 'DO $') {
        inDoBlock = true
      } else if (inDoBlock && char === '$' && prev === '$' && cleaned.substr(i - 3, 4) === 'END$') {
        // Look for semicolon after $$;
        for (let j = i + 1; j < cleaned.length; j++) {
          if (cleaned[j] === ';') {
            current += cleaned.substring(i, j + 1)
            i = j
            inDoBlock = false
            break
          }
        }
      }
    }

    // Add character to current statement
    current += char

    // Check if we've reached the end of a statement
    if (char === ';' && !inString && !inDoBlock) {
      const trimmed = current.trim()
      if (trimmed && trimmed !== ';') {
        statements.push(trimmed)
      }
      current = ''
    }
  }

  // Add final statement if exists
  const finalTrimmed = current.trim()
  if (finalTrimmed && finalTrimmed !== ';') {
    statements.push(finalTrimmed)
  }

  logSuccess(`Split into ${statements.length} SQL statements`)
  return statements
}

async function executeSqlStatement(statement, index, total) {
  const preview = statement.substring(0, 100).replace(/\s+/g, ' ')
  log(`[${index + 1}/${total}] Executing: ${preview}...`)

  try {
    // Use Supabase RPC to execute raw SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: statement
    })

    if (error) {
      // Try alternative method using postgres REST API
      const response = await fetch(`${NEW_DB.url}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': NEW_DB.serviceKey,
          'Authorization': `Bearer ${NEW_DB.serviceKey}`
        },
        body: JSON.stringify({ sql_query: statement })
      })

      if (!response.ok) {
        // If RPC doesn't exist, we need to execute statements manually
        // For CREATE TABLE, ALTER TABLE, etc., we can use the schema endpoint
        throw new Error(`Statement execution failed: ${error.message || response.statusText}`)
      }
    }

    logSuccess(`Statement ${index + 1} executed`)
    return true
  } catch (error) {
    logError(`Failed to execute statement ${index + 1}`, error)
    log('Statement content:', statement)
    throw error
  }
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
    const sql = await readSqlFile()

    // Split into statements
    const statements = splitSqlStatements(sql)

    log(`\n📋 Found ${statements.length} SQL statements to execute\n`)

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      await executeSqlStatement(statements[i], i, statements.length)
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Calculate duration
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Print summary
    console.log('\n===================================')
    console.log('🎉 Schema Setup Completed!')
    console.log('===================================')
    console.log(`Statements Executed: ${statements.length}`)
    console.log(`Duration: ${duration}s`)
    console.log('===================================')
    console.log('\n📝 Next Steps:')
    console.log('1. Verify schema in Supabase dashboard')
    console.log('2. Run data migration: node migration/02_data_migration.js')
    console.log('3. Update .env.local with new database credentials')
    console.log('4. Test application with new database')
    console.log('===================================\n')

    process.exit(0)
  } catch (error) {
    console.error('\n===================================')
    console.error('💥 Schema Setup Failed!')
    console.error('===================================')
    logError('Setup error', error)
    console.error('\n⚠️  MANUAL SETUP REQUIRED:')
    console.error('Please run the SQL manually in Supabase SQL Editor:')
    console.error(`1. Open: ${NEW_DB.url}`)
    console.error('2. Go to SQL Editor')
    console.error('3. Copy contents of: migration/01_artlee_schema_creation.sql')
    console.error('4. Paste and execute in SQL Editor')
    console.error('5. Then run: node migration/02_data_migration.js')
    console.error('===================================\n')
    process.exit(1)
  }
}

// ============================================================================
// ALTERNATIVE: MANUAL SQL EXECUTION GUIDE
// ============================================================================

function printManualInstructions() {
  console.log('\n📋 MANUAL SCHEMA SETUP INSTRUCTIONS')
  console.log('===================================')
  console.log('If the automated script fails, follow these steps:')
  console.log('')
  console.log('1. Open Supabase Dashboard:')
  console.log(`   ${NEW_DB.url}`)
  console.log('')
  console.log('2. Navigate to SQL Editor (left sidebar)')
  console.log('')
  console.log('3. Create a new query')
  console.log('')
  console.log('4. Copy the entire contents of:')
  console.log('   migration/01_artlee_schema_creation.sql')
  console.log('')
  console.log('5. Paste into the SQL Editor')
  console.log('')
  console.log('6. Click "Run" to execute the schema creation')
  console.log('')
  console.log('7. Verify all tables were created in the Table Editor')
  console.log('')
  console.log('8. Then run the data migration:')
  console.log('   node migration/02_data_migration.js')
  console.log('===================================\n')
}

// ============================================================================
// RUN SETUP
// ============================================================================

// Check if running as main module
if (require.main === module) {
  // Check command line arguments
  if (process.argv.includes('--manual')) {
    printManualInstructions()
    process.exit(0)
  }

  runSchemaSetup()
}

module.exports = { runSchemaSetup, printManualInstructions }
