# Agent ID Persistence Issue - Root Cause Analysis

## Executive Summary

**Issue:** Call Agent ID and SMS Agent ID disappear after page refresh, but API Key persists correctly.

**Root Cause:** Storage/retrieval mismatch caused by:
1. **409 Conflict Error** on `user_profiles` upsert (duplicate key violation)
2. **400 Schema Cache Error** on `user_settings` (missing `api_key_updated_at` column in cache)
3. **Fallback to localStorage** - Agent IDs saved to localStorage only, not Supabase
4. **Retrieval code doesn't check localStorage** - Only queries Supabase tables

## Current Storage Flow (Lines in Code)

### Save Operation (apiKeyFallbackService.ts):

1. **Line 111-175**: `storeApiKeys()` - Main entry point
   ```typescript
   // Tries 3 methods in order:
   1. storeInUserProfiles() - Line 133-137 ✅ API Key works, ❌ Agent IDs fail (409 Conflict)
   2. storePartialInUserProfiles() - Line 141-145 ❌ Fails (400 Schema Cache)
   3. storeInUserSettings() - Line 149-151 ❌ Fails (400 Schema Cache)
   4. storeInLocalStorage() - Line 154-156 ✅ SUCCESS (fallback)
   ```

2. **Lines 180-203**: `storeInUserProfiles()`
   ```typescript
   await supabase
     .from('user_profiles')
     .upsert({
       user_id: userId,
       encrypted_retell_api_key: encryptedKeys.retell_api_key,
       encrypted_agent_config: agentConfig,  // ❌ 409 Conflict on this field
       updated_at: new Date().toISOString()
     })
   ```
   **Result:** 409 Conflict - "duplicate key value violates unique constraint user_profiles_user_id_key"

3. **Lines 208-247**: `storePartialInUserProfiles()`
   ```typescript
   // Tries to save Agent Config to user_settings
   await supabase
     .from('user_settings')
     .upsert({
       user_id: userId,
       tenant_id: getCurrentTenantId(),
       retell_agent_config: agentConfig,
       encrypted_retell_keys: encryptedKeys,
       api_key_updated_at: new Date().toISOString(),  // ❌ 400 Schema Cache error
       updated_at: new Date().toISOString()
     })
   ```
   **Result:** 400 Bad Request - "Could not find the 'api_key_updated_at' column in schema cache"

4. **Lines 252-283**: `storeInUserSettings()`
   ```typescript
   await supabase
     .from('user_settings')
     .upsert({
       user_id: userId,
       tenant_id: getCurrentTenantId(),
       retell_config: retellConfig,
       encrypted_api_keys: encryptedKeys,
       api_key_updated_at: new Date().toISOString(),  // ❌ 400 Schema Cache error
       updated_at: new Date().toISOString()
     })
   ```
   **Result:** 400 Bad Request - Same schema cache error

5. **Lines 310-331**: `storeInLocalStorage()` ✅ SUCCESS
   ```typescript
   const storageKey = `apikeys_${userId}`
   const dataToStore = {
     encrypted_keys: encryptedKeys,  // ✅ Agent IDs stored here
     stored_at: new Date().toISOString(),
     storage_method: 'localStorage_fallback'
   }
   localStorage.setItem(storageKey, JSON.stringify(dataToStore))
   ```
   **Result:** Agent IDs successfully stored in localStorage ONLY

### Retrieval Operation (apiKeyFallbackService.ts):

1. **Line 336-372**: `retrieveApiKeys()` - Main entry point
   ```typescript
   // Tries 3 methods in order:
   1. retrieveFromUserProfiles() - Line 341-344 ✅ Gets API Key, ❌ No Agent Config
   2. retrievePartialFromUserProfiles() - Line 348-351 ✅ Gets API Key, ❌ No Agent Config
   3. retrieveFromUserSettings() - Line 354-356 ❌ Fails (no data)
   4. retrieveFromLocalStorage() - Line 359-360 ✅ HAS Agent IDs BUT NEVER REACHED
   ```

2. **Lines 377-403**: `retrieveFromUserProfiles()`
   ```typescript
   const { data, error } = await supabase
     .from('user_profiles')
     .select('encrypted_retell_api_key, encrypted_agent_config')
     .eq('user_id', userId)
     .eq('tenant_id', getCurrentTenantId())
     .single()

   // Returns API Key ✅
   // Returns encrypted_agent_config: {} ❌ (empty object, no Agent IDs)
   ```
   **Result:** API Key retrieved, but `encrypted_agent_config` is empty object `{}`

3. **Lines 408-443**: `retrievePartialFromUserProfiles()`
   ```typescript
   // Gets API key from user_profiles ✅
   // Tries to get agent config from user_settings ❌ (no data)
   ```
   **Result:** API Key retrieved, no Agent IDs

4. **Lines 448-471**: `retrieveFromUserSettings()`
   ```typescript
   const { data, error } = await supabase
     .from('user_settings')
     .select('retell_config, encrypted_api_keys')
     .eq('user_id', userId)
     .eq('tenant_id', getCurrentTenantId())
     .single()
   ```
   **Result:** No data found (Agent IDs were never saved to user_settings)

5. **Lines 476-505**: `retrieveFromLocalStorage()` ✅ HAS THE DATA
   ```typescript
   const storageKey = `apikeys_${userId}`
   const storedData = localStorage.getItem(storageKey)
   // ✅ This contains the Agent IDs!
   // ❌ BUT this method is NEVER CALLED because retrieval succeeds at step 1
   ```
   **Result:** Contains Agent IDs but unreachable code path

## The Smoking Gun

### Why API Key Persists:
- API Key is saved to `user_profiles.encrypted_retell_api_key` successfully
- Retrieval finds it in `user_profiles` table
- **Result:** ✅ Works perfectly

### Why Agent IDs Disappear:
1. **Save to user_profiles FAILS:**
   - 409 Conflict when trying to upsert `encrypted_agent_config`
   - Existing record has constraint violation on update

2. **Save to user_settings FAILS:**
   - 400 Schema Cache error - Postgrest doesn't see new columns
   - `api_key_updated_at` column exists but not in schema cache

3. **Fallback to localStorage SUCCEEDS:**
   - Agent IDs saved to `localStorage.getItem('apikeys_${userId}')`

4. **Retrieval from user_profiles SUCCEEDS (but returns empty):**
   - Query succeeds, returns `encrypted_agent_config: {}`
   - Function returns early with success status
   - **NEVER reaches localStorage retrieval code**

5. **Agent IDs lost on refresh:**
   - localStorage has the data
   - Retrieval code gets empty object from user_profiles
   - Returns success with empty Agent IDs
   - UI shows empty fields

## Database State After Save

Based on console logs, the current database state is:

### user_profiles table:
```json
{
  "user_id": "edd07847-d90a-4b1a-9904-e6bc752ff501",
  "tenant_id": "artlee",
  "encrypted_retell_api_key": "[encrypted API key]",  // ✅ Has value
  "encrypted_agent_config": {},  // ❌ Empty object or null
  "updated_at": "2025-10-28T..."
}
```

### user_settings table:
```json
{
  "user_id": "edd07847-d90a-4b1a-9904-e6bc752ff501",
  "tenant_id": "artlee",
  "retell_config": null,  // ❌ No data
  "retell_agent_config": null,  // ❌ No data
  "encrypted_retell_keys": null,  // ❌ No data
  "api_key_updated_at": null  // ❌ Column exists but not in schema cache
}
```

### localStorage:
```json
{
  "apikeys_edd07847-d90a-4b1a-9904-e6bc752ff501": {
    "encrypted_keys": {
      "retell_api_key": "[encrypted]",
      "call_agent_id": "[encrypted agent_ca2a01536c2e94d0ff4e50df70]",  // ✅ HAS VALUE
      "sms_agent_id": null
    },
    "stored_at": "2025-10-28T...",
    "storage_method": "localStorage_fallback"
  }
}
```

## Why 409 Conflict on user_profiles?

The upsert operation is failing because:

1. **Record already exists** with `user_id = edd07847-d90a-4b1a-9904-e6bc752ff501`
2. **Unique constraint:** `user_profiles_user_id_key` on `user_id` column
3. **Upsert behavior:** Supabase JS `.upsert()` without `.onConflict()` clause
4. **Expected:** Should UPDATE existing record
5. **Actual:** Tries to INSERT, hits constraint, returns 409

### Fix for 409 Conflict:
```typescript
// ❌ CURRENT (Line 182-189):
await supabase
  .from('user_profiles')
  .upsert({
    user_id: userId,
    encrypted_retell_api_key: encryptedKeys.retell_api_key,
    encrypted_agent_config: agentConfig,
    updated_at: new Date().toISOString()
  })

// ✅ FIXED - Add onConflict clause:
await supabase
  .from('user_profiles')
  .upsert({
    user_id: userId,
    encrypted_retell_api_key: encryptedKeys.retell_api_key,
    encrypted_agent_config: agentConfig,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'user_id',  // Specify which column to check for conflicts
    ignoreDuplicates: false  // Update on conflict, don't ignore
  })
```

## Why 400 Schema Cache Error?

1. **Column exists:** `user_settings.api_key_updated_at` column was added in migration
2. **Postgrest schema cache outdated:** Supabase's PostgREST layer caches table schemas
3. **Cache refresh needed:** Schema cache needs manual refresh to detect new columns

### Fix for Schema Cache:

#### Option 1: Reload PostgREST Schema Cache (Immediate)
```sql
-- Run in Supabase SQL Editor:
NOTIFY pgrst, 'reload schema';
```

#### Option 2: Use RPC Function (Bypass Cache)
Create a database function that bypasses schema cache:

```sql
-- Create RPC function to update user_settings
CREATE OR REPLACE FUNCTION update_user_api_keys(
  p_user_id UUID,
  p_tenant_id TEXT,
  p_retell_config JSONB,
  p_encrypted_api_keys JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  INSERT INTO user_settings (
    user_id,
    tenant_id,
    retell_config,
    encrypted_api_keys,
    api_key_updated_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_tenant_id,
    p_retell_config,
    p_encrypted_api_keys,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, tenant_id)
  DO UPDATE SET
    retell_config = EXCLUDED.retell_config,
    encrypted_api_keys = EXCLUDED.encrypted_api_keys,
    api_key_updated_at = NOW(),
    updated_at = NOW();

  SELECT jsonb_build_object('success', true) INTO v_result;
  RETURN v_result;
END;
$$;
```

Then use it from code:
```typescript
const { data, error } = await supabase
  .rpc('update_user_api_keys', {
    p_user_id: userId,
    p_tenant_id: getCurrentTenantId(),
    p_retell_config: retellConfig,
    p_encrypted_api_keys: encryptedKeys
  })
```

## Recommended Fixes

### Fix 1: Add onConflict to user_profiles upsert (CRITICAL)

**File:** `src/services/apiKeyFallbackService.ts` - Line 182

```typescript
const { error } = await supabase
  .from('user_profiles')
  .upsert({
    user_id: userId,
    encrypted_retell_api_key: encryptedKeys.retell_api_key,
    encrypted_agent_config: agentConfig,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'user_id'  // ADD THIS
  })
```

### Fix 2: Reload PostgREST Schema Cache (IMMEDIATE)

Run in Supabase SQL Editor:
```sql
NOTIFY pgrst, 'reload schema';
```

### Fix 3: Always check localStorage as final fallback in retrieval

**File:** `src/services/apiKeyFallbackService.ts` - Line 377-402

Change `retrieveFromUserProfiles()` to check localStorage if `encrypted_agent_config` is empty:

```typescript
private async retrieveFromUserProfiles(userId: string): Promise<{status: 'success' | 'error', data?: ApiKeys, error?: string}> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('encrypted_retell_api_key, encrypted_agent_config')
      .eq('user_id', userId)
      .eq('tenant_id', getCurrentTenantId())
      .single()

    if (error) throw error

    const apiKeys: ApiKeys = {}

    if (data?.encrypted_retell_api_key) {
      apiKeys.retell_api_key = await encryptionService.decryptString(data.encrypted_retell_api_key)
    }

    const agentConfig = data.encrypted_agent_config || {}

    // ✅ ADD THIS CHECK - If Agent Config is empty, try localStorage
    if (!agentConfig.call_agent_id && !agentConfig.sms_agent_id) {
      console.log('ApiKeyFallbackService: Agent Config empty in user_profiles, checking localStorage')
      const localStorageResult = await this.retrieveFromLocalStorage(userId)
      if (localStorageResult.status === 'success' && localStorageResult.data) {
        // Merge localStorage agent IDs with database API key
        if (localStorageResult.data.call_agent_id) {
          apiKeys.call_agent_id = localStorageResult.data.call_agent_id
        }
        if (localStorageResult.data.sms_agent_id) {
          apiKeys.sms_agent_id = localStorageResult.data.sms_agent_id
        }
      }
    } else {
      // Use agent config from database
      if (agentConfig.call_agent_id) apiKeys.call_agent_id = agentConfig.call_agent_id
      if (agentConfig.sms_agent_id) apiKeys.sms_agent_id = agentConfig.sms_agent_id
    }

    return { status: 'success', data: apiKeys }
  } catch (error: any) {
    console.error('ApiKeyFallbackService: Error retrieving from user_profiles:', error)
    return { status: 'error', error: error.message }
  }
}
```

### Fix 4: Use RPC function for user_settings (Optional, if schema cache reload doesn't work)

Create the RPC function shown above and update `storeInUserSettings()` to use it.

## Testing Plan

1. **Test with diagnostic tool:**
   - Open `diagnostic-agent-ids.html` in browser
   - Enter Supabase credentials
   - Run diagnostics to see current database state

2. **Apply Fix 1 (onConflict):**
   - Update `apiKeyFallbackService.ts` line 182
   - Save Call Agent ID
   - Refresh page
   - Check if Agent ID persists

3. **Apply Fix 2 (Schema Cache):**
   - Run `NOTIFY pgrst, 'reload schema';` in Supabase SQL Editor
   - Save Call Agent ID
   - Refresh page
   - Check if Agent ID persists

4. **Apply Fix 3 (localStorage fallback):**
   - Update `retrieveFromUserProfiles()` function
   - Refresh page (without saving)
   - Check if Agent IDs appear from localStorage

5. **Verify all fixes:**
   - Save all Agent IDs
   - Refresh page multiple times
   - Check localStorage, user_profiles, and user_settings
   - Ensure all locations have consistent data

## Success Criteria

✅ Agent IDs persist after page refresh
✅ Agent IDs stored in database (not just localStorage)
✅ No 409 Conflict errors on save
✅ No 400 Schema Cache errors on save
✅ Diagnostic tool shows Agent IDs in all expected locations
✅ API Key continues to work correctly
✅ Tenant isolation maintained (getCurrentTenantId() filtering)

## Files to Modify

1. `src/services/apiKeyFallbackService.ts` - Lines 182-189, 212-233, 260-269, 377-402
2. Supabase SQL Editor - Run schema cache reload command
3. (Optional) Create RPC function in Supabase if schema cache reload doesn't work

## Priority

**CRITICAL** - This breaks core functionality (Agent ID configuration)

**Estimated Fix Time:** 30 minutes

**Risk Level:** LOW - Changes are isolated to fallback service, with clear rollback path
