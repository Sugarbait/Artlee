# ARTLEE CRM - Supabase 406/400 Error Troubleshooting Guide

## Quick Diagnosis

### Run These Scripts in Order:

1. **DIAGNOSTIC_QUERIES.sql** - Identify the problem
2. **FIX_406_400_ERRORS.sql** - Fix permissions and RLS
3. **FIX_CONTENT_TYPE_406.sql** - Fix content-type issues

## Common Error Causes

### 406 (Not Acceptable) Errors

**Symptom:** `GET https://...supabase.co/rest/v1/users?select=... 406 (Not Acceptable)`

**Common Causes:**
1. **Missing Accept header** - Frontend not sending `Accept: application/json`
2. **RLS policy issues** - Policy prevents read but allows write (confusing)
3. **Invalid JSONB data** - Malformed JSON in JSONB columns
4. **Schema cache stale** - PostgREST hasn't reloaded schema
5. **Column type mismatch** - Data type cannot be serialized to JSON

**Quick Fixes:**
```sql
-- 1. Disable RLS temporarily for testing
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 2. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 3. Check if table is accessible
SELECT COUNT(*) FROM users;

-- 4. Grant all permissions
GRANT ALL ON users TO anon;
GRANT ALL ON users TO authenticated;
```

### 400 (Bad Request) Errors

**Symptom:** `POST https://...supabase.co/rest/v1/failed_login_attempts 400 (Bad Request)`

**Common Causes:**
1. **Missing required columns** - INSERT lacks NOT NULL column
2. **Type mismatch** - Sending string where integer expected
3. **Constraint violation** - Check constraint fails
4. **Foreign key violation** - Referenced record doesn't exist
5. **Invalid JSON** - Malformed JSON in request body

**Quick Fixes:**
```sql
-- 1. Check table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'failed_login_attempts'
ORDER BY ordinal_position;

-- 2. Test manual insert
INSERT INTO failed_login_attempts (
  email, ip_address, user_agent, tenant_id, attempted_at
) VALUES (
  'test@test.com', '127.0.0.1', 'Test', 'artlee', NOW()
);

-- 3. Check constraints
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'failed_login_attempts';
```

## Step-by-Step Troubleshooting

### Step 1: Verify Database Structure

```sql
-- Run this to check all tables exist
SELECT tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'user_settings', 'user_profiles',
    'audit_logs', 'notes', 'failed_login_attempts',
    'user_credentials', 'company_settings'
  );
```

**Expected:** All 8 tables should appear

### Step 2: Check Permissions

```sql
-- Verify anon role has permissions
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_name IN ('users', 'user_profiles', 'failed_login_attempts')
ORDER BY table_name, privilege_type;
```

**Expected:** Each table should have SELECT, INSERT, UPDATE, DELETE

### Step 3: Check RLS Policies

```sql
-- List all RLS policies
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Expected:** Each table should have at least one PERMISSIVE policy with `qual = true`

### Step 4: Test Manual Operations

```sql
-- Test SELECT
SELECT COUNT(*) FROM users;

-- Test INSERT
INSERT INTO users (id, email, tenant_id, role)
VALUES ('test_user', 'test@test.com', 'artlee', 'user');

-- Clean up
DELETE FROM users WHERE id = 'test_user';
```

**Expected:** No errors on any operation

### Step 5: Reload Schema Cache

```sql
-- Force PostgREST to reload
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
```

**Expected:** No errors, cache reloaded

## Frontend Debugging

### Check Browser Network Tab

1. Open DevTools → Network tab
2. Try to login
3. Find the failed request
4. Check **Request Headers**:
   ```
   Accept: application/json
   Content-Type: application/json
   apikey: your-anon-key
   ```

5. Check **Request Payload**:
   ```json
   {
     "email": "user@example.com",
     "tenant_id": "artlee",
     "id": "some-id"
   }
   ```

6. Check **Response**:
   - 406: Check if Accept header is present
   - 400: Check response body for specific error message

### Common Frontend Issues

**Issue 1: Missing tenant_id in queries**
```typescript
// ❌ WRONG: Missing tenant filter
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', email)

// ✅ CORRECT: Include tenant filter
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', email)
  .eq('tenant_id', 'artlee')
```

**Issue 2: Wrong Supabase URL or key**
```typescript
// Check .env.local
VITE_SUPABASE_URL=https://fslniuhyunzlfcbxsiol.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your-actual-key
```

**Issue 3: Supabase client not initialized**
```typescript
// Check src/config/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## Emergency Reset Procedure

If nothing works, run this complete reset:

```sql
-- 1. Drop all policies
DROP POLICY IF EXISTS "Allow all operations on users" ON users;
DROP POLICY IF EXISTS "Allow all operations on user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow all operations on user_settings" ON user_settings;
DROP POLICY IF EXISTS "Allow all operations on audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Allow all operations on notes" ON notes;
DROP POLICY IF EXISTS "Allow all operations on failed_login_attempts" ON failed_login_attempts;
DROP POLICY IF EXISTS "Allow all operations on user_credentials" ON user_credentials;
DROP POLICY IF EXISTS "Allow all operations on company_settings" ON company_settings;

-- 2. Disable RLS
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE failed_login_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings DISABLE ROW LEVEL SECURITY;

-- 3. Grant all permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 4. Reload schema
NOTIFY pgrst, 'reload schema';

-- 5. Test access
SELECT COUNT(*) FROM users;
```

**⚠️ WARNING:** This completely disables security. Only use for debugging, then re-enable RLS.

## Verification Checklist

After running fixes, verify:

- [ ] All 8 tables exist in database
- [ ] All tables have proper column definitions
- [ ] `anon` role has SELECT, INSERT, UPDATE, DELETE on all tables
- [ ] `authenticated` role has SELECT, INSERT, UPDATE, DELETE on all tables
- [ ] RLS is enabled on all tables (if needed)
- [ ] RLS policies are permissive (USING true, WITH CHECK true)
- [ ] PostgREST schema cache has been reloaded
- [ ] Manual INSERT/SELECT works in SQL editor
- [ ] Frontend can connect to Supabase (check Network tab)
- [ ] Environment variables are correct in .env.local
- [ ] No constraint violations on INSERT operations

## Next Steps

1. **Run DIAGNOSTIC_QUERIES.sql** first to identify issues
2. **Run FIX_406_400_ERRORS.sql** to fix permissions
3. **Run FIX_CONTENT_TYPE_406.sql** if 406 errors persist
4. **Check frontend code** for correct tenant_id usage
5. **Check browser console** for specific error messages
6. **Check Supabase dashboard logs** for server-side errors

## Contact Points

If issues persist:
- Supabase Dashboard → Logs → Check API logs for detailed errors
- Browser DevTools → Network tab → Check request/response details
- PostgreSQL logs → Check for constraint violations or type errors

## Common Success Patterns

**Pattern 1: Fresh database setup**
```sql
-- 1. Create tables
-- 2. Grant permissions to anon/authenticated
-- 3. Enable RLS with permissive policies
-- 4. Reload schema cache
-- 5. Test from frontend
```

**Pattern 2: Fixing existing database**
```sql
-- 1. Disable RLS
-- 2. Drop all policies
-- 3. Grant all permissions
-- 4. Re-enable RLS with simple policies
-- 5. Reload schema cache
```

**Pattern 3: Debugging frontend**
```typescript
// 1. Verify environment variables
// 2. Check Supabase client initialization
// 3. Add tenant_id to all queries
// 4. Check Network tab for actual errors
// 5. Add error logging
```

## Final Notes

- **Always include tenant_id** in all queries (ARTLEE uses multi-tenant architecture)
- **Always reload schema cache** after schema changes (`NOTIFY pgrst, 'reload schema'`)
- **Always test manually in SQL editor** before testing from frontend
- **Always check browser Network tab** for exact error details
- **Always verify environment variables** are loaded correctly

The most common issue is **missing tenant_id filters** in queries. ARTLEE requires `tenant_id = 'artlee'` on all operations.
