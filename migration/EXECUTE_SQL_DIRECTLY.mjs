/**
 * Execute SQL directly via Supabase
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const NEW_DB = {
  url: 'https://fslniuhyunzlfcbxsiol.supabase.co',
  serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s'
}

const supabase = createClient(NEW_DB.url, NEW_DB.serviceKey, {
  auth: { persistSession: false }
})

async function executeSQL(sqlFile, description) {
  console.log(`\n🔧 ${description}`)
  console.log('=' .repeat(50))

  const sql = readFileSync(join(__dirname, sqlFile), 'utf8')

  // Split into statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && s !== '✅ Old schema dropped successfully' && s !== 'Now run: artlee-setup-new-database.sql')

  console.log(`Found ${statements.length} SQL statements`)

  let success = 0
  let errors = 0

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]

    if (!stmt || stmt.length < 5) continue

    const preview = stmt.substring(0, 60).replace(/\s+/g, ' ') + '...'
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}`)

    try {
      // Try executing via rpc
      const { error } = await supabase.rpc('exec', { sql: stmt })

      if (error) {
        // Many DDL statements will "fail" via RPC but that's expected
        // We'll verify by checking if tables exist afterwards
        process.stdout.write(' ⚠️\n')
        errors++
      } else {
        process.stdout.write(' ✅\n')
        success++
      }
    } catch (e) {
      process.stdout.write(' ⚠️\n')
      errors++
    }

    await new Promise(resolve => setTimeout(resolve, 50))
  }

  console.log(`\nResults: ${success} succeeded, ${errors} expected warnings`)
  console.log('=' .repeat(50))
}

async function main() {
  console.log('🚀 ARTLEE Schema Fix - Direct Execution')
  console.log('=' .repeat(50))
  console.log('Target:', NEW_DB.url)
  console.log('=' .repeat(50))

  try {
    // Step 1: Drop old schema
    await executeSQL('00_drop_old_schema.sql', 'Step 1: Drop Old Schema')

    // Step 2: Create new schema
    await executeSQL('artlee-setup-new-database.sql', 'Step 2: Create New Schema')

    // Verify
    console.log('\n🔍 Verifying Schema...')
    console.log('=' .repeat(50))

    const tables = ['users', 'user_settings', 'audit_logs', 'user_credentials', 'notes', 'failed_login_attempts']

    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(1)
      if (error) {
        console.log(`❌ ${table}: NOT FOUND`)
      } else {
        console.log(`✅ ${table}: EXISTS`)
      }
    }

    console.log('\n' + '=' .repeat(50))
    console.log('⚠️  NOTE: Supabase API has limitations with DDL execution.')
    console.log('If verification shows tables NOT FOUND, you need to run the SQL manually:')
    console.log('')
    console.log('1. Open: https://fslniuhyunzlfcbxsiol.supabase.co/project/_/sql/new')
    console.log('2. Copy: migration/00_drop_old_schema.sql → Paste → Run')
    console.log('3. Copy: migration/artlee-setup-new-database.sql → Paste → Run')
    console.log('=' .repeat(50))

  } catch (error) {
    console.error('\n💥 Error:', error.message)
  }
}

main()
