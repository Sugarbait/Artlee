# ARTLEE CRM Migration - Quick Start

## 🚀 Fastest Path to Completion (5 Minutes)

### Why Schema Setup Can't Be Fully Automated

Supabase's REST API **does not support arbitrary DDL (Data Definition Language) operations** for security reasons. This means:
- ❌ Cannot create tables via REST API
- ❌ Cannot modify schema via service role key
- ❌ Cannot execute SQL statements programmatically
- ✅ **Must run SQL manually in Supabase dashboard (ONE TIME ONLY)**

After this one manual step, everything else is **100% automated**.

---

## ⚡ 2-Step Migration Process

### Step 1: Create Schema (Manual - 2 minutes)

1. **Open** this link in your browser:
   ```
   https://fslniuhyunzlfcbxsiol.supabase.co/project/_/sql/new
   ```

2. **Copy** the entire contents of:
   ```
   I:\Apps Back Up\ARTLEE CRM\migration\01_artlee_schema_creation.sql
   ```

3. **Paste** into the SQL Editor

4. **Click** "Run" button

5. **Verify** you see "Success" message

### Step 2: Migrate Data (Automated - 3 minutes)

Open terminal and run:

```bash
cd "I:\Apps Back Up\ARTLEE CRM"
node migration/DATA_ONLY_MIGRATION.mjs
```

**That's it!** The script will:
- ✅ Verify schema exists
- ✅ Migrate all 7 tables automatically
- ✅ Handle large datasets with pagination
- ✅ Show real-time progress
- ✅ Display complete results

---

## 📊 What Gets Migrated

| Table | Description | Filter |
|-------|-------------|--------|
| `users` | User accounts | `tenant_id = 'artlee'` |
| `user_settings` | User preferences | `tenant_id = 'artlee'` |
| `user_profiles` | Profile data | `tenant_id = 'artlee'` |
| `audit_logs` | HIPAA audit trail | `tenant_id = 'artlee'` |
| `notes` | Cross-device notes | `tenant_id = 'artlee'` |
| `system_credentials` | API keys | `tenant_id = 'artlee'` |
| `company_settings` | Branding | `tenant_id = 'artlee'` |

**Only ARTLEE data migrates** - MedEx and CareXPS data stays in old database.

---

## ✅ Success Criteria

Migration is complete when you see:

```
🎉 MIGRATION COMPLETE!
================================
  users                1
  user_settings        1
  user_profiles        1
  audit_logs           150
  notes                5
  system_credentials   3
  company_settings     1

Total: 162 records
Time: 3.5s
================================
```

---

## 🧪 Testing After Migration

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Clear browser cache** (Ctrl+Shift+Delete)

3. **Test login** at http://localhost:3000

4. **Verify data:**
   - Dashboard shows metrics
   - SMS page shows conversations
   - Calls page shows records
   - Settings accessible

---

## 🚀 Production Deployment

### Update GitHub Secrets

Go to: https://github.com/your-repo/settings/secrets/actions

Update these secrets:

```
VITE_SUPABASE_URL=https://fslniuhyunzlfcbxsiol.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTA1MTAsImV4cCI6MjA3NTU4NjUxMH0.1_ln5Dt5p1tagxWwGH77cp9U2nLky6xfHG77VGEgQiI
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s
```

### Deploy

```bash
git add .
git commit -m "Migrate to dedicated ARTLEE database"
git push origin main
```

Azure will auto-deploy to: **https://artlee.nexasync.ca**

---

## 🆘 Troubleshooting

### "Schema NOT FOUND" Error

**Solution:** Run Step 1 (schema setup) first, then retry.

### "Duplicate key" Error

**Solution:** Data already migrated. Check new database for existing records.

### "Connection timeout" Error

**Solution:** Check internet connection. Retry with:
```bash
node migration/DATA_ONLY_MIGRATION.mjs
```

### Migration Fails Midway

**Solution:** See `ROLLBACK_PROCEDURES.md` for recovery steps.

---

## 📁 Migration Files

| File | Purpose |
|------|---------|
| `01_artlee_schema_creation.sql` | Schema SQL (run manually) |
| `DATA_ONLY_MIGRATION.mjs` | **→ USE THIS SCRIPT** |
| `QUICKSTART.md` | **→ YOU ARE HERE** |
| `MIGRATION_GUIDE.md` | Comprehensive guide |
| `ROLLBACK_PROCEDURES.md` | Emergency rollback |
| `TESTING_CHECKLIST.md` | Full test suite |

---

## ⏱️ Timeline

- **Schema Setup:** 2 minutes (manual)
- **Data Migration:** 3 minutes (automated)
- **Local Testing:** 5 minutes
- **Production Deploy:** 10 minutes

**Total Time:** ~20 minutes

---

## 🎯 Next Step

**Run this command now:**

```bash
cd "I:\Apps Back Up\ARTLEE CRM"
node migration/DATA_ONLY_MIGRATION.mjs
```

If schema doesn't exist, you'll get clear instructions.
If schema exists, migration runs automatically.

---

**Last Updated:** October 9, 2025
**Status:** ✅ Ready for execution
