# ARTLEE CRM - Complete Database Migration Guide

## 🚀 Migrating ARTLEE to Dedicated Database

This comprehensive guide walks you through migrating ARTLEE CRM from the shared multi-tenant database to its own dedicated Supabase database.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Pre-Migration Checklist](#pre-migration-checklist)
4. [Migration Steps](#migration-steps)
5. [Post-Migration Verification](#post-migration-verification)
6. [Rollback Procedures](#rollback-procedures)
7. [Production Deployment](#production-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### Current State
- **Database:** Shared multi-tenant (cpkslvmydfdevdftieck.supabase.co)
- **Tenant ID:** 'artlee'
- **Data Sharing:** ARTLEE, MedEx, CareXPS share same database
- **Isolation:** tenant_id filtering in application code

### Target State
- **Database:** Dedicated ARTLEE (fslniuhyunzlfcbxsiol.supabase.co)
- **Tenant ID:** 'artlee' (maintained for consistency)
- **Data Sharing:** None - 100% isolated
- **Isolation:** Physical database separation

### Benefits
- ✅ Complete data isolation
- ✅ Independent scaling
- ✅ Simplified maintenance
- ✅ Improved security
- ✅ No cross-tenant interference

---

## Prerequisites

### Required Tools
- [ ] Node.js 18+ installed
- [ ] npm or yarn package manager
- [ ] Access to both Supabase databases
- [ ] Supabase CLI (optional, recommended)
- [ ] Git (for version control)

### Required Access
- [ ] Old database credentials (provided in scripts)
- [ ] New database credentials (provided in scripts)
- [ ] Super User access to both databases
- [ ] GitHub repository access (for production deploy)

### Required Knowledge
- [ ] Basic SQL understanding
- [ ] Node.js/JavaScript basics
- [ ] Supabase dashboard navigation
- [ ] Command line usage

---

## Pre-Migration Checklist

### 1. Backup Current Data

**CRITICAL: Always backup before migration!**

```bash
# Create backup directory
mkdir -p migration/backups/$(date +%Y%m%d)

# Backup configuration files
cp .env.local migration/backups/$(date +%Y%m%d)/.env.local.backup
cp src/config/supabase.ts migration/backups/$(date +%Y%m%d)/supabase.ts.backup
```

**Database Backup:**
1. Open old database dashboard: https://cpkslvmydfdevdftieck.supabase.co
2. Navigate to Database > Backups
3. Create manual backup snapshot
4. Download backup (optional but recommended)

### 2. Document Current State

```bash
# Count current records (run in old database SQL Editor)
SELECT 'users' as table_name, COUNT(*) as count FROM users WHERE tenant_id = 'artlee'
UNION ALL
SELECT 'user_settings', COUNT(*) FROM user_settings WHERE tenant_id = 'artlee'
UNION ALL
SELECT 'user_profiles', COUNT(*) FROM user_profiles WHERE tenant_id = 'artlee'
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs WHERE tenant_id = 'artlee'
UNION ALL
SELECT 'notes', COUNT(*) FROM notes WHERE tenant_id = 'artlee'
UNION ALL
SELECT 'system_credentials', COUNT(*) FROM system_credentials WHERE tenant_id = 'artlee'
UNION ALL
SELECT 'company_settings', COUNT(*) FROM company_settings WHERE tenant_id = 'artlee';
```

**Document these counts - you'll verify them after migration.**

### 3. Install Dependencies

```bash
# Install required npm packages
npm install @supabase/supabase-js

# Verify installation
node -e "console.log(require('@supabase/supabase-js').createClient ? '✅ Installed' : '❌ Failed')"
```

### 4. Verify File Structure

```bash
# Ensure all migration files exist
ls -la migration/

# Expected files:
# - 00_run_schema_setup.js
# - 01_artlee_schema_creation.sql
# - 02_data_migration.js
# - MIGRATION_GUIDE.md (this file)
# - ROLLBACK_PROCEDURES.md
# - TESTING_CHECKLIST.md
```

---

## Migration Steps

### Step 1: Schema Setup (Manual Recommended)

**Option A: Manual SQL Execution (RECOMMENDED)**

1. **Open New Database Dashboard**
   ```
   https://fslniuhyunzlfcbxsiol.supabase.co
   ```

2. **Navigate to SQL Editor**
   - Left sidebar → SQL Editor
   - Click "New query"

3. **Copy Schema SQL**
   - Open `migration/01_artlee_schema_creation.sql`
   - Copy entire contents (Ctrl+A, Ctrl+C)

4. **Execute Schema Creation**
   - Paste into SQL Editor
   - Click "Run" (or Ctrl+Enter)
   - Wait for "Success" message

5. **Verify Tables Created**
   - Left sidebar → Table Editor
   - Should see: users, user_settings, user_profiles, audit_logs, notes, system_credentials, company_settings

**Option B: Automated Script (Alternative)**

```bash
# Run automated schema setup
node migration/00_run_schema_setup.js

# If it fails, use Option A (Manual SQL Execution)
```

**✅ Checkpoint:** Verify all tables exist in new database before proceeding.

---

### Step 2: Data Migration

**Run the data migration script:**

```bash
# Execute data migration
node migration/02_data_migration.js
```

**Expected Output:**

```
🚀 ARTLEE CRM Data Migration Started
=====================================
Source DB: https://cpkslvmydfdevdftieck.supabase.co
Target DB: https://fslniuhyunzlfcbxsiol.supabase.co
Tenant ID: artlee
=====================================

📦 Migrating users table...
Found 5 users to migrate
✅ Users migrated (5 records)

📦 Migrating user_settings table...
Found 5 user settings to migrate
✅ User settings migrated (5 records)

... [continues for all tables] ...

=====================================
🎉 Migration Completed Successfully!
=====================================
Records Migrated:
  Users:              5
  User Settings:      5
  User Profiles:      5
  Audit Logs:         1234
  Notes:              12
  System Credentials: 3
  Company Settings:   1

Total Records:        1265
Duration:             15.45s
=====================================
```

**⚠️ If Migration Fails:**
- Review error message in console
- Check database connectivity
- Verify credentials in script
- Consult [Troubleshooting](#troubleshooting) section
- If needed, follow [Rollback Procedures](#rollback-procedures)

**✅ Checkpoint:** Compare record counts with pre-migration counts documented in Step 2.

---

### Step 3: Update Application Configuration

**This step has ALREADY been completed! (.env.local has been updated)**

Verify the changes:

```bash
# Check .env.local has new credentials
cat .env.local | grep VITE_SUPABASE_URL

# Should show:
# VITE_SUPABASE_URL=https://fslniuhyunzlfcbxsiol.supabase.co
```

**If you need to manually update:**

Edit `.env.local`:

```bash
# Supabase Configuration (ARTLEE Dedicated Database)
VITE_SUPABASE_URL=https://fslniuhyunzlfcbxsiol.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTA1MTAsImV4cCI6MjA3NTU4NjUxMH0.1_ln5Dt5p1tagxWwGH77cp9U2nLky6xfHG77VGEgQiI
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s
```

**✅ Checkpoint:** Configuration files updated.

---

### Step 4: Test Locally

**Restart Development Server:**

```bash
# Stop current server (Ctrl+C)
# Start fresh
npm run dev
```

**Clear Browser Cache:**

```javascript
// Open browser console (F12)
localStorage.clear()
sessionStorage.clear()
location.reload()
```

**Quick Smoke Test:**

1. **Login Test**
   - Navigate to http://localhost:3000
   - Login with valid credentials
   - ✅ Should login successfully

2. **Dashboard Test**
   - Navigate to Dashboard
   - ✅ Should load without errors
   - ✅ Should show metrics

3. **Data Test**
   - Check SMS page
   - Check Calls page
   - ✅ Should load data

**If Any Test Fails:**
- Check browser console for errors
- Review network tab for failed requests
- Verify database connectivity
- See [Troubleshooting](#troubleshooting)

**✅ Checkpoint:** Application works locally with new database.

---

### Step 5: Comprehensive Testing

**Use the comprehensive testing checklist:**

```bash
# Open testing checklist
cat migration/TESTING_CHECKLIST.md
```

**Critical Tests (Must Pass):**
- [ ] Authentication (login/logout)
- [ ] Dashboard page loads
- [ ] SMS page loads with data
- [ ] Calls page loads with data
- [ ] Settings page accessible
- [ ] User management works (Super User)
- [ ] Data integrity verified
- [ ] No console errors

**See:** `migration/TESTING_CHECKLIST.md` for complete test suite.

**✅ Checkpoint:** All critical tests pass.

---

## Post-Migration Verification

### Verify Data Integrity

**Run these queries in NEW database:**

```sql
-- 1. Verify all users migrated
SELECT COUNT(*) as user_count FROM users WHERE tenant_id = 'artlee';

-- 2. Verify user settings
SELECT COUNT(*) as settings_count FROM user_settings WHERE tenant_id = 'artlee';

-- 3. Verify audit logs
SELECT COUNT(*) as audit_count FROM audit_logs WHERE tenant_id = 'artlee';

-- 4. Check Super Users exist
SELECT email, name, role, is_super_user
FROM users
WHERE tenant_id = 'artlee' AND (role = 'super_user' OR is_super_user = true);

-- 5. Verify API credentials preserved
SELECT COUNT(*) as creds_with_api_key
FROM user_settings
WHERE tenant_id = 'artlee' AND retell_api_key IS NOT NULL;
```

**Compare with pre-migration counts. Should match!**

### Verify Application Functionality

**Test all critical user paths:**

1. **User Login Flow**
   - Login → Dashboard → Logout

2. **Data Access**
   - SMS Page → View Chats
   - Calls Page → View Calls
   - Dashboard → View Metrics

3. **Settings Management**
   - Profile → Edit and Save
   - API Credentials → Update
   - Theme → Switch Dark/Light

4. **Admin Functions (Super User)**
   - User Management → View Users
   - Audit Logs → View History

### Monitor for Issues

**Check for errors:**

```bash
# Browser console should be clean
# Look for:
# - No red errors
# - No failed network requests
# - No Supabase connection errors
```

**Common warnings (safe to ignore):**
- WebSocket connection warnings (if in offline mode)
- React strict mode double-renders (development only)

---

## Rollback Procedures

**If anything goes wrong:**

See `migration/ROLLBACK_PROCEDURES.md` for detailed rollback instructions.

**Quick Rollback (5 minutes):**

1. **Restore old database credentials in `.env.local`:**
   ```bash
   VITE_SUPABASE_URL=https://cpkslvmydfdevdftieck.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY5MDAyOTUsImV4cCI6MjA2MjQ3NjI5NX0.IfkIVsp3AtLOyXDW9hq9bEvnozd9IaaUay244iDhWGE
   VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0
   ```

2. **Clear browser cache:**
   ```javascript
   localStorage.clear()
   sessionStorage.clear()
   location.reload()
   ```

3. **Restart server:**
   ```bash
   npm run dev
   ```

**✅ Application should work with old database.**

---

## Production Deployment

### Update Azure Environment Variables

**GitHub Repository Settings → Secrets and variables → Actions**

Update these secrets:

```
VITE_SUPABASE_URL=https://fslniuhyunzlfcbxsiol.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTA1MTAsImV4cCI6MjA3NTU4NjUxMH0.1_ln5Dt5p1tagxWwGH77cp9U2nLky6xfHG77VGEgQiI
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbG5pdWh5dW56bGZjYnhzaW9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDAxMDUxMCwiZXhwIjoyMDc1NTg2NTEwfQ.D-u2G16p5nJshivBaXXU3jUZU0eIn0xAgAD83UXCE-s
```

### Deploy to Production

```bash
# Commit changes
git add .env.local migration/
git commit -m "🚀 Migrate ARTLEE to dedicated database"

# Push to main branch (triggers Azure deploy)
git push origin main
```

### Monitor Deployment

1. **Watch GitHub Actions**
   - Repository → Actions tab
   - Wait for build to complete (3-5 minutes)

2. **Verify Production**
   - Navigate to production URL
   - Test login
   - Quick smoke test

3. **Monitor for Errors**
   - Check browser console
   - Monitor Azure logs (if available)

---

## Troubleshooting

### Issue: Migration Script Fails

**Symptoms:**
- Script exits with error
- "Cannot connect to database" message

**Solutions:**

1. **Check Database Credentials**
   ```javascript
   // Verify in migration scripts
   // OLD_DB.url should be: cpkslvmydfdevdftieck
   // NEW_DB.url should be: fslniuhyunzlfcbxsiol
   ```

2. **Check Network Connectivity**
   ```bash
   # Test old database
   curl https://cpkslvmydfdevdftieck.supabase.co

   # Test new database
   curl https://fslniuhyunzlfcbxsiol.supabase.co
   ```

3. **Verify Dependencies**
   ```bash
   npm install @supabase/supabase-js
   ```

---

### Issue: Application Shows "Not Configured"

**Symptoms:**
- "Supabase not configured" in console
- localStorage-only mode message

**Solutions:**

1. **Verify .env.local Updated**
   ```bash
   cat .env.local | grep VITE_SUPABASE_URL
   ```

2. **Restart Dev Server**
   ```bash
   # Kill server (Ctrl+C)
   npm run dev
   ```

3. **Clear Environment Cache**
   ```bash
   rm -rf node_modules/.vite
   npm run dev
   ```

---

### Issue: Data Not Loading

**Symptoms:**
- Empty lists (no SMS, calls, users)
- Spinners spinning indefinitely

**Solutions:**

1. **Check Browser Console**
   - Look for 400/401/403 errors
   - Check network tab for failed requests

2. **Verify Data Migrated**
   ```sql
   -- Run in new database
   SELECT COUNT(*) FROM users WHERE tenant_id = 'artlee';
   ```

3. **Check RLS Policies**
   ```sql
   -- Verify policies exist
   SELECT tablename, policyname
   FROM pg_policies
   WHERE schemaname = 'public';
   ```

4. **Grant Permissions (if needed)**
   ```sql
   GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
   ```

---

### Issue: "User Not Found" on Login

**Symptoms:**
- Valid credentials not working
- User exists in old database

**Solutions:**

1. **Verify User Migrated**
   ```sql
   -- Run in new database
   SELECT * FROM users WHERE email = 'your-email@example.com';
   ```

2. **Check tenant_id Filter**
   ```sql
   -- Verify tenant_id is 'artlee'
   SELECT tenant_id FROM users WHERE email = 'your-email@example.com';
   ```

3. **Re-run User Migration**
   ```bash
   # Edit 02_data_migration.js to only run migrateUsers()
   node migration/02_data_migration.js
   ```

---

### Issue: Audit Logs Missing

**Symptoms:**
- Audit Dashboard empty
- No login history

**Solutions:**

1. **Check Audit Logs Migrated**
   ```sql
   SELECT COUNT(*) FROM audit_logs WHERE tenant_id = 'artlee';
   ```

2. **Re-run Audit Migration**
   - Audit logs are migrated in batches
   - Large audit logs may take time

3. **Verify New Logs Being Created**
   - Perform a login
   - Check if new audit log appears

---

## Success Criteria

**Migration is successful when:**

✅ **Database**
- [ ] All tables created in new database
- [ ] All ARTLEE data migrated
- [ ] Record counts match pre-migration
- [ ] RLS policies active

✅ **Application**
- [ ] Login works
- [ ] Dashboard loads with data
- [ ] SMS page shows conversations
- [ ] Calls page shows call records
- [ ] Settings page accessible
- [ ] User management works (Super User)

✅ **Testing**
- [ ] All critical tests pass
- [ ] No console errors
- [ ] Cross-device sync works
- [ ] Audit logging active

✅ **Production** (after deployment)
- [ ] Production site loads
- [ ] Production login works
- [ ] Production data loads
- [ ] No production errors

---

## Post-Migration Tasks

### 1. Update Documentation

- [ ] Update README.md with new database info
- [ ] Update CLAUDE.md if needed
- [ ] Document any issues encountered

### 2. Monitor Application

- [ ] Monitor error logs for 24-48 hours
- [ ] Check user feedback
- [ ] Monitor database performance

### 3. Clean Up (Optional)

**After confirming migration success:**

- [ ] Can delete old ARTLEE data from shared database (OPTIONAL - keep as backup)
- [ ] Remove old database credentials from .env.local (commented out)
- [ ] Archive migration scripts

**⚠️ Keep old database as backup for at least 30 days!**

---

## Support & Resources

**Migration Files:**
- `migration/01_artlee_schema_creation.sql` - Database schema
- `migration/02_data_migration.js` - Data migration script
- `migration/ROLLBACK_PROCEDURES.md` - Rollback guide
- `migration/TESTING_CHECKLIST.md` - Testing checklist

**Database Dashboards:**
- Old: https://cpkslvmydfdevdftieck.supabase.co
- New: https://fslniuhyunzlfcbxsiol.supabase.co

**Application:**
- Development: http://localhost:3000
- Production: https://artlee.nexasync.ca

---

## Timeline Estimates

**Total Migration Time:** 1-2 hours (including testing)

- Pre-migration backup: 15 minutes
- Schema setup: 10 minutes
- Data migration: 10-20 minutes (depending on data size)
- Configuration update: 5 minutes
- Local testing: 20-30 minutes
- Comprehensive testing: 30-60 minutes
- Production deployment: 10 minutes

**Note:** Times may vary based on data volume and testing thoroughness.

---

## Checklist Summary

**Pre-Migration:**
- [ ] Backup current data
- [ ] Document record counts
- [ ] Install dependencies
- [ ] Verify file structure

**Migration:**
- [ ] Create schema in new database
- [ ] Run data migration script
- [ ] Update .env.local (ALREADY DONE)
- [ ] Test locally

**Post-Migration:**
- [ ] Verify data integrity
- [ ] Run comprehensive tests
- [ ] Deploy to production
- [ ] Monitor for issues

**Rollback Ready:**
- [ ] Have old credentials saved
- [ ] Know rollback procedure
- [ ] Backups accessible

---

**Migration Prepared By:** Claude AI Assistant
**Date:** 2025-10-09
**Version:** 1.0
**Status:** Ready for Execution

**🚀 You're ready to migrate ARTLEE to its dedicated database!**
