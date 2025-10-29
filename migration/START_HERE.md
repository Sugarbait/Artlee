# 🚀 ARTLEE CRM Migration - START HERE

## Status: ✅ Ready for Execution

---

## ⚡ TL;DR - What You Need to Know

1. **Schema creation CANNOT be fully automated** (Supabase API limitation)
2. **One manual step required**: Run SQL in Supabase dashboard (2 minutes)
3. **After that**: Everything is 100% automated

---

## 🎯 Your Current Situation

✅ **All migration files created**
✅ **Configuration updated** (`.env.local`)
✅ **Data migration script ready**
✅ **Documentation complete**

❌ **Schema not yet created** in new database

---

## 🔥 Execute Migration NOW (5 Minutes Total)

### Option 1: Quick 2-Step Process (RECOMMENDED)

#### Step 1: Create Schema (2 minutes)

1. Open this URL:
   ```
   https://fslniuhyunzlfcbxsiol.supabase.co/project/_/sql/new
   ```

2. Open this file in text editor:
   ```
   I:\Apps Back Up\ARTLEE CRM\migration\01_artlee_schema_creation.sql
   ```

3. Copy entire contents (Ctrl+A, Ctrl+C)

4. Paste into Supabase SQL Editor (Ctrl+V)

5. Click "Run" button

6. Wait for "Success" message

#### Step 2: Migrate Data (3 minutes - FULLY AUTOMATED)

Open Command Prompt and run:

```bash
cd "I:\Apps Back Up\ARTLEE CRM"
node migration/DATA_ONLY_MIGRATION.mjs
```

Watch the automatic migration complete!

---

### Option 2: Use Interactive Master Script

```bash
cd "I:\Apps Back Up\ARTLEE CRM"
node migration/RUNMIGRATION.mjs
```

This script will:
- Check if schema exists
- Prompt you to run SQL manually
- Automatically migrate data after confirmation
- Show complete results

---

## 📊 Migration Details

### Source Database (Old)
- URL: https://cpkslvmydfdevdftieck.supabase.co
- Type: Shared multi-tenant database
- Tenants: ARTLEE, MedEx, CareXPS

### Target Database (New)
- URL: https://fslniuhyunzlfcbxsiol.supabase.co
- Type: Dedicated ARTLEE database
- Tenant: ARTLEE only

### Data Filter
**Only migrates records with:** `tenant_id = 'artlee'`

### Tables Migrated
1. `users` - User accounts
2. `user_settings` - User preferences
3. `user_profiles` - Profile data
4. `audit_logs` - HIPAA audit trail
5. `notes` - Cross-device notes
6. `system_credentials` - API credentials
7. `company_settings` - Company branding

---

## ✅ Success Output

When migration completes successfully, you'll see:

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

📝 Next Steps:
  1. npm run dev
  2. Clear browser cache
  3. Test at localhost:3000
  4. Update GitHub secrets
  5. Deploy to artlee.nexasync.ca
```

---

## 🧪 Testing Checklist

After migration:

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Clear browser cache** (very important!)
   - Chrome: Ctrl+Shift+Delete
   - Select "All time"
   - Check "Cookies" and "Cached files"

3. **Open** http://localhost:3000

4. **Test login:**
   - Use your ARTLEE credentials
   - MFA should work if enabled

5. **Verify pages:**
   - ✅ Dashboard shows metrics
   - ✅ SMS page shows conversations
   - ✅ Calls page shows records
   - ✅ Settings page loads
   - ✅ User Management (if Super User)

6. **Check data integrity:**
   - All your chats visible
   - Call history present
   - Notes synced
   - Settings preserved

---

## 🚀 Production Deployment

### 1. Update GitHub Secrets

Repository: https://github.com/your-org/artlee-crm
Go to: Settings → Secrets and variables → Actions

Add/Update these secrets:

```
VITE_SUPABASE_URL
Value: https://fslniuhyunzlfcbxsiol.supabase.co

VITE_SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTA1MTAsImV4cCI6MjA3NTU4NjUxMH0.1_ln5Dt5p1tagxWwGH77cp9U2nLky6xfHG77VGEgQiI

VITE_SUPABASE_SERVICE_ROLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s
```

### 2. Deploy to Production

```bash
git add .
git commit -m "🚀 Migrate to dedicated ARTLEE database"
git push origin main
```

Azure Static Web Apps will automatically deploy to:
**https://artlee.nexasync.ca**

---

## 📁 Migration Files Reference

| File | Purpose | When to Use |
|------|---------|-------------|
| **START_HERE.md** | **→ THIS FILE** | **Start here** |
| **QUICKSTART.md** | Quick reference | Fast overview |
| **DATA_ONLY_MIGRATION.mjs** | **→ RUN THIS** | **Main script** |
| `RUNMIGRATION.mjs` | Interactive version | Alternative |
| `01_artlee_schema_creation.sql` | Schema SQL | Manual setup |
| `MIGRATION_GUIDE.md` | Full guide | Deep dive |
| `ROLLBACK_PROCEDURES.md` | Emergency recovery | If problems |
| `TESTING_CHECKLIST.md` | Test cases | Thorough testing |

---

## 🆘 Troubleshooting

### Error: "Schema NOT FOUND"

**Solution:** You haven't run Step 1 yet. Run the schema SQL in Supabase dashboard.

### Error: "Duplicate key"

**Cause:** Data already migrated.

**Solution:** Check if migration already succeeded. Look at new database tables.

### Error: "Connection timeout"

**Solution:**
1. Check internet connection
2. Verify Supabase is accessible
3. Retry migration script

### Migration Stops Midway

**Solution:**
1. Check error message
2. See `ROLLBACK_PROCEDURES.md`
3. May need to clear new database and retry

### Can't Login After Migration

**Solution:**
1. Clear browser cache completely
2. Clear localStorage:
   - Open browser DevTools (F12)
   - Go to Application tab
   - Clear storage
3. Restart browser
4. Try login again

---

## 🔄 Rollback Plan

If anything goes wrong:

### Quick Rollback (5 minutes)

1. **Restore** old credentials in `.env.local`:
   ```env
   VITE_SUPABASE_URL=https://cpkslvmydfdevdftieck.supabase.co
   VITE_SUPABASE_ANON_KEY=[old-anon-key]
   VITE_SUPABASE_SERVICE_ROLE_KEY=[old-service-key]
   ```

2. **Restart** dev server

3. **Clear** browser cache

4. **Test** - app should work with old database

See `ROLLBACK_PROCEDURES.md` for detailed recovery steps.

---

## 📈 Benefits After Migration

✅ **Complete data isolation** from MedEx/CareXPS
✅ **Independent database** for ARTLEE
✅ **Better performance** (dedicated resources)
✅ **Simplified maintenance** (single tenant)
✅ **Enhanced security** (physical separation)
✅ **Easier scaling** (ARTLEE-specific optimization)

---

## ⏱️ Estimated Timeline

| Phase | Time | Status |
|-------|------|--------|
| Preparation | 15 min | ✅ Complete |
| Schema setup | 2 min | ⏳ Pending |
| Data migration | 3 min | ⏳ Pending |
| Local testing | 5 min | ⏳ Pending |
| Production deploy | 10 min | ⏳ Pending |

**Total Time Remaining:** ~20 minutes

---

## 🎯 NEXT ACTION

**Execute migration NOW:**

```bash
# Step 1: Open browser, run schema SQL (2 minutes)
start https://fslniuhyunzlfcbxsiol.supabase.co/project/_/sql/new

# Step 2: Run data migration (3 minutes)
cd "I:\Apps Back Up\ARTLEE CRM"
node migration/DATA_ONLY_MIGRATION.mjs
```

---

## 📞 Support

### If Migration Fails
- Check `ROLLBACK_PROCEDURES.md`
- Review `MIGRATION_GUIDE.md` troubleshooting section
- Verify internet connection and Supabase access

### If Need Help
- All documentation in `migration/` folder
- Detailed guides available
- Rollback plan documented

---

## ✅ Migration Completion Checklist

- [ ] Schema SQL executed in Supabase dashboard
- [ ] Data migration script completed successfully
- [ ] Local testing passed (npm run dev)
- [ ] GitHub secrets updated
- [ ] Production deployed to artlee.nexasync.ca
- [ ] Production site tested
- [ ] Old database kept as backup
- [ ] Documentation updated

---

**Status:** Ready for execution
**Date Created:** October 9, 2025
**Last Updated:** October 9, 2025

---

## 🚀 GO! Execute Migration Now!

**Your next command:**

```bash
cd "I:\Apps Back Up\ARTLEE CRM" && node migration/DATA_ONLY_MIGRATION.mjs
```

If schema doesn't exist, you'll get clear instructions.

**Good luck! 🎉**
