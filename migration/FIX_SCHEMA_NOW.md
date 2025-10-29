# 🔧 ARTLEE CRM - Fix Schema (Corrected from MedEx Blueprint)

## ✅ What Was Wrong

The original schema I created used **UUID** for user IDs, but ARTLEE (like MedEx) uses **TEXT** for user IDs.

This caused:
- ❌ Migration couldn't find data (wrong ID type)
- ❌ Missing tables: `user_credentials`, `failed_login_attempts`
- ❌ Wrong policy names
- ❌ Wrong table structure

## 🔧 The Fix

I've now created the **correct schema based on MedEx blueprint**, with all "medex" renamed to "artlee".

---

## 🚀 Execute Fix NOW (2 Steps)

### Step 1: Drop Old Incorrect Schema

1. **Open:** https://fslniuhyunzlfcbxsiol.supabase.co/project/_/sql/new

2. **Copy this file:**
   ```
   I:\Apps Back Up\ARTLEE CRM\migration\00_drop_old_schema.sql
   ```

3. **Paste and Run** in SQL Editor

4. **Wait for "Success"** message

---

### Step 2: Create New Correct Schema

1. **In the same SQL Editor** (or open new query)

2. **Copy this file:**
   ```
   I:\Apps Back Up\ARTLEE CRM\migration\artlee-setup-new-database.sql
   ```

3. **Paste and Run** in SQL Editor

4. **Wait for "Success"** message

---

## ✅ What This Creates

### Tables Created:
1. ✅ **users** (id = TEXT, tenant_id = 'artlee')
2. ✅ **user_settings** (with retell_config)
3. ✅ **audit_logs** (HIPAA compliance)
4. ✅ **user_credentials** (password storage)
5. ✅ **notes** (cross-device sync)
6. ✅ **failed_login_attempts** (security)

### Key Features:
- ✅ User IDs are TEXT (matches MedEx structure)
- ✅ All tenant_id defaults to 'artlee'
- ✅ RLS policies with "artlee_" prefix
- ✅ Permissive policies (allow anon/authenticated)
- ✅ All indexes for performance
- ✅ HIPAA-compliant audit logging

---

## 📊 After Schema Fix

Once both SQL files run successfully, you can:

1. **Check if old database has ARTLEE data:**
   ```bash
   cd "I:\Apps Back Up\ARTLEE CRM"
   node migration/CHECK_OLD_FOR_ARTLEE.mjs
   ```

2. **If data exists, migrate it**
3. **If no data exists, start fresh**

---

## 🔍 Verify Schema Created Correctly

After running both SQL files:

```bash
cd "I:\Apps Back Up\ARTLEE CRM"
node migration/CHECK_NEW_DATABASE.mjs
```

Should show:
- ✅ 6 tables exist
- ✅ All tables have 0 records (ready for migration)

---

**Ready to fix? Run those 2 SQL files now!** 🚀
