# Proposed Fixes for Agent ID Persistence Issue

## Summary of Issue

Agent IDs are being saved to **localStorage only** (not Supabase database) due to:
1. **409 Conflict** on `user_profiles` upsert (missing `onConflict` clause)
2. **400 Schema Cache** error on `user_settings` (Postgrest schema cache outdated)
3. **Retrieval code doesn't fallback to localStorage** when database returns empty Agent Config

API Key persists because it's saved to `user_profiles.encrypted_retell_api_key` successfully, but Agent IDs are NOT saved to `user_profiles.encrypted_agent_config` due to upsert conflict.

## Three-Pronged Fix Strategy

### Fix 1: Add onConflict to user_profiles upsert (CRITICAL)

**Location:** `src/services/apiKeyFallbackService.ts` - Lines 182-189

**Current Code:**
```typescript
const { error } = await supabase
  .from('user_profiles')
  .upsert({
    user_id: userId,
    encrypted_retell_api_key: encryptedKeys.retell_api_key,
    encrypted_agent_config: agentConfig,
    updated_at: new Date().toISOString()
  })
```

**Fixed Code:**
```typescript
const { error } = await supabase
  .from('user_profiles')
  .upsert({
    user_id: userId,
    encrypted_retell_api_key: encryptedKeys.retell_api_key,
    encrypted_agent_config: agentConfig,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'user_id'  // Specify conflict resolution column
  })
```

**Why this fixes 409 Conflict:**
- Tells Supabase to UPDATE existing record instead of INSERT
- Resolves "duplicate key value violates unique constraint" error
- Allows Agent Config to be saved to database

---

### Fix 2: Reload PostgREST Schema Cache (IMMEDIATE)

**Location:** Supabase SQL Editor

**Run this SQL command:**
```sql
NOTIFY pgrst, 'reload schema';
```

**Why this fixes 400 Schema Cache error:**
- PostgREST caches table schemas for performance
- New columns (`api_key_updated_at`) exist in database but not in cache
- NOTIFY command forces cache refresh
- After refresh, upsert to `user_settings` will work

**Alternative (if NOTIFY doesn't work):**
Create RPC function to bypass schema cache:

```sql
-- Create function that directly inserts/updates user_settings
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_user_api_keys TO authenticated;
```

Then update `apiKeyFallbackService.ts` line 260 to use RPC:

```typescript
private async storeInUserSettings(userId: string, apiKeys: ApiKeys, encryptedKeys: EncryptedKeys): Promise<{status: 'success' | 'error', error?: string}> {
  try {
    const retellConfig = {
      api_key: apiKeys.retell_api_key,
      call_agent_id: apiKeys.call_agent_id,
      sms_agent_id: apiKeys.sms_agent_id,
    }

    // Use RPC function instead of direct upsert
    const { error } = await supabase.rpc('update_user_api_keys', {
      p_user_id: userId,
      p_tenant_id: getCurrentTenantId(),
      p_retell_config: retellConfig,
      p_encrypted_api_keys: encryptedKeys
    })

    if (error) throw error

    await auditLogger.logSecurityEvent('API_KEYS_STORED_FALLBACK', 'user_settings', true, {
      userId,
      method: 'fallback_storage_rpc'
    })

    return { status: 'success' }
  } catch (error: any) {
    console.error('ApiKeyFallbackService: Error storing in user_settings:', error)
    return { status: 'error', error: error.message }
  }
}
```

---

### Fix 3: Add localStorage fallback to retrieval (SAFETY NET)

**Location:** `src/services/apiKeyFallbackService.ts` - Lines 377-402

**Enhanced `retrieveFromUserProfiles()` method:**

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

    // Get API key from database
    if (data?.encrypted_retell_api_key) {
      apiKeys.retell_api_key = await encryptionService.decryptString(data.encrypted_retell_api_key)
    }

    const agentConfig = data.encrypted_agent_config || {}

    // Check if Agent Config is empty or missing - FALLBACK TO LOCALSTORAGE
    const hasCallAgent = !!agentConfig.call_agent_id
    const hasSmsAgent = !!agentConfig.sms_agent_id

    if (!hasCallAgent && !hasSmsAgent) {
      console.log('ApiKeyFallbackService: Agent Config empty in user_profiles, checking localStorage fallback')

      // Try to get Agent IDs from localStorage
      const localStorageResult = await this.retrieveFromLocalStorage(userId)

      if (localStorageResult.status === 'success' && localStorageResult.data) {
        console.log('ApiKeyFallbackService: Found Agent IDs in localStorage, merging with database API key')

        // Merge localStorage Agent IDs with database API key
        if (localStorageResult.data.call_agent_id) {
          apiKeys.call_agent_id = localStorageResult.data.call_agent_id
          console.log('ApiKeyFallbackService: Restored call_agent_id from localStorage')
        }
        if (localStorageResult.data.sms_agent_id) {
          apiKeys.sms_agent_id = localStorageResult.data.sms_agent_id
          console.log('ApiKeyFallbackService: Restored sms_agent_id from localStorage')
        }
      } else {
        console.log('ApiKeyFallbackService: No Agent IDs found in localStorage either')
      }
    } else {
      // Use Agent Config from database (normal flow)
      if (agentConfig.call_agent_id) {
        apiKeys.call_agent_id = agentConfig.call_agent_id
      }
      if (agentConfig.sms_agent_id) {
        apiKeys.sms_agent_id = agentConfig.sms_agent_id
      }
      console.log('ApiKeyFallbackService: Agent Config loaded from user_profiles')
    }

    return { status: 'success', data: apiKeys }
  } catch (error: any) {
    console.error('ApiKeyFallbackService: Error retrieving from user_profiles:', error)

    // Final emergency fallback - try localStorage
    console.log('ApiKeyFallbackService: Database retrieval failed, trying localStorage')
    const localStorageResult = await this.retrieveFromLocalStorage(userId)
    if (localStorageResult.status === 'success') {
      return localStorageResult
    }

    return { status: 'error', error: error.message }
  }
}
```

**Why this is a safety net:**
- Even if database save fails, Agent IDs can be retrieved from localStorage
- Prevents data loss during transition period
- User won't lose Agent IDs after refresh
- Once database save is fixed, this becomes redundant but harmless

---

## Implementation Order

1. **FIRST:** Apply Fix 2 (Reload schema cache) - Takes 10 seconds
2. **SECOND:** Apply Fix 1 (Add onConflict) - Takes 2 minutes
3. **THIRD:** Apply Fix 3 (localStorage fallback in retrieval) - Takes 5 minutes
4. **TEST:** Save Agent IDs and refresh page multiple times
5. **VERIFY:** Use diagnostic tool to check all storage locations

---

## Testing Checklist

### Before Fixes:
- [ ] Run diagnostic tool (`diagnostic-agent-ids.html`)
- [ ] Confirm Agent IDs are in localStorage only
- [ ] Confirm `user_profiles.encrypted_agent_config` is empty
- [ ] Confirm `user_settings` has no Agent IDs

### After Fix 1 (onConflict):
- [ ] Save Call Agent ID in Settings
- [ ] Check console for 409 Conflict error (should be gone)
- [ ] Refresh page
- [ ] Verify Agent ID still displays

### After Fix 2 (Schema cache):
- [ ] Save Agent IDs again
- [ ] Check console for 400 Schema Cache error (should be gone)
- [ ] Run diagnostic tool
- [ ] Verify Agent IDs are in `user_settings` table

### After Fix 3 (localStorage fallback):
- [ ] Refresh page WITHOUT saving
- [ ] Verify Agent IDs appear from localStorage
- [ ] Save new Agent IDs
- [ ] Refresh page
- [ ] Verify Agent IDs persist

### Final Verification:
- [ ] Agent IDs in `user_profiles.encrypted_agent_config`
- [ ] Agent IDs in `user_settings.retell_config` or `retell_agent_config`
- [ ] Agent IDs in localStorage (as backup)
- [ ] No console errors on save
- [ ] No console errors on retrieval
- [ ] Agent IDs persist across multiple page refreshes
- [ ] API Key continues to work correctly

---

## Rollback Plan

If fixes cause issues:

1. **Rollback Fix 3:** Remove localStorage fallback from `retrieveFromUserProfiles()`
2. **Rollback Fix 1:** Remove `onConflict` from upsert (revert to original)
3. **Rollback Fix 2:** No rollback needed (schema cache reload is safe)

**Restore from Git:**
```bash
git checkout src/services/apiKeyFallbackService.ts
```

---

## Success Metrics

✅ **Zero 409 Conflict errors** on save
✅ **Zero 400 Schema Cache errors** on save
✅ **Agent IDs persist** after page refresh
✅ **Agent IDs stored in database** (not just localStorage)
✅ **API Key continues to work** correctly
✅ **No breaking changes** to existing functionality

---

## Estimated Time

- **Fix 1:** 2 minutes
- **Fix 2:** 10 seconds (or 15 minutes if RPC function needed)
- **Fix 3:** 5 minutes
- **Testing:** 10 minutes

**Total:** 17-32 minutes

---

## Risk Assessment

**Risk Level:** 🟢 LOW

**Why low risk:**
- Changes are isolated to `apiKeyFallbackService.ts`
- No changes to UI components
- No changes to existing database schema
- Clear rollback path (git revert)
- Fixes are additive (don't remove existing functionality)
- localStorage fallback provides safety net

**Potential Issues:**
- ⚠️ If schema cache reload doesn't work, RPC function required (adds 15 min)
- ⚠️ If tenant filtering is wrong, could affect wrong users (already has getCurrentTenantId())
- ⚠️ If encryption fails, will fall back to localStorage (already handled)

---

## Questions for Owner

1. **Do you want to apply all 3 fixes, or start with Fix 1 and 2 only?**
   - Recommendation: Apply all 3 for maximum safety

2. **Should we create the RPC function immediately, or try schema cache reload first?**
   - Recommendation: Try schema cache reload first (faster)

3. **Do you want automated migration to move localStorage data to database?**
   - Recommendation: Yes, create migration function to sync localStorage → database

4. **Should we add automatic retry logic if save fails?**
   - Recommendation: Not needed - fallback chain already provides redundancy

---

## Next Steps

**Waiting for your authorization to proceed with fixes.**

Once authorized, I will:
1. Apply Fix 2 (schema cache reload SQL command)
2. Apply Fix 1 (add onConflict to apiKeyFallbackService.ts)
3. Apply Fix 3 (add localStorage fallback to retrieval)
4. Test all fixes
5. Verify with diagnostic tool
6. Confirm Agent IDs persist correctly
