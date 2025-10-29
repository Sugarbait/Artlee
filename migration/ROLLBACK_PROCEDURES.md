# ARTLEE CRM - Rollback Procedures

## 🚨 Emergency Rollback Guide

This document provides step-by-step procedures to rollback the database migration in case of issues.

---

## Table of Contents
1. [Pre-Migration Backup](#pre-migration-backup)
2. [Quick Rollback (Environment Variables Only)](#quick-rollback)
3. [Full Rollback (If Data Corrupted)](#full-rollback)
4. [Verification Steps](#verification-steps)
5. [Common Issues & Solutions](#common-issues)

---

## Pre-Migration Backup

**⚠️ CRITICAL: Always backup before migration!**

### 1. Export Current ARTLEE Data (SQL Dump)

```sql
-- Run this in the OLD database (cpkslvmydfdevdftieck) SQL Editor

-- Export users
COPY (SELECT * FROM users WHERE tenant_id = 'artlee') TO STDOUT WITH CSV HEADER;

-- Export user_settings
COPY (SELECT * FROM user_settings WHERE tenant_id = 'artlee') TO STDOUT WITH CSV HEADER;

-- Export user_profiles
COPY (SELECT * FROM user_profiles WHERE tenant_id = 'artlee') TO STDOUT WITH CSV HEADER;

-- Export audit_logs
COPY (SELECT * FROM audit_logs WHERE tenant_id = 'artlee') TO STDOUT WITH CSV HEADER;

-- Export notes
COPY (SELECT * FROM notes WHERE tenant_id = 'artlee') TO STDOUT WITH CSV HEADER;

-- Export system_credentials
COPY (SELECT * FROM system_credentials WHERE tenant_id = 'artlee') TO STDOUT WITH CSV HEADER;

-- Export company_settings
COPY (SELECT * FROM company_settings WHERE tenant_id = 'artlee') TO STDOUT WITH CSV HEADER;
```

### 2. Save Backup Files

Save each export to a file:
- `backup/users_backup_YYYYMMDD.csv`
- `backup/user_settings_backup_YYYYMMDD.csv`
- `backup/user_profiles_backup_YYYYMMDD.csv`
- `backup/audit_logs_backup_YYYYMMDD.csv`
- `backup/notes_backup_YYYYMMDD.csv`
- `backup/system_credentials_backup_YYYYMMDD.csv`
- `backup/company_settings_backup_YYYYMMDD.csv`

### 3. Backup Configuration Files

```bash
# Create backup directory
mkdir -p migration/backups/$(date +%Y%m%d)

# Backup .env.local
cp .env.local migration/backups/$(date +%Y%m%d)/.env.local.backup

# Backup supabase config
cp src/config/supabase.ts migration/backups/$(date +%Y%m%d)/supabase.ts.backup
```

---

## Quick Rollback

**Use this if:** Application not working, but data is safe in old database

### Step 1: Restore Old Database Credentials

Edit `.env.local`:

```bash
# Restore OLD database credentials
VITE_SUPABASE_URL=https://cpkslvmydfdevdftieck.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY5MDAyOTUsImV4cCI6MjA2MjQ3NjI5NX0.IfkIVsp3AtLOyXDW9hq9bEvnozd9IaaUay244iDhWGE
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwa3Nsdm15ZGZkZXZkZnRpZWNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjkwMDI5NSwiZXhwIjoyMDYyNDc2Mjk1fQ.5Nwr-DrgL63DwPMH2egxgdjoHGhAxCvIrz2SMTMKqD0
```

### Step 2: Clear Browser Cache

```javascript
// Open browser console and run:
localStorage.clear()
sessionStorage.clear()
location.reload()
```

### Step 3: Restart Application

```bash
npm run dev
```

### Step 4: Verify Rollback

- [ ] Login works
- [ ] Dashboard loads
- [ ] SMS page loads
- [ ] Calls page loads
- [ ] User settings accessible

**✅ If all checks pass, rollback is complete!**

---

## Full Rollback

**Use this if:** Data corrupted or migration partially completed

### Prerequisites
- Backup files from Pre-Migration Backup section
- Access to old database (cpkslvmydfdevdftieck)

### Step 1: Restore Environment Variables

Follow [Quick Rollback Step 1](#step-1-restore-old-database-credentials)

### Step 2: Verify Old Database Integrity

```sql
-- Run in OLD database SQL Editor

-- Check users count
SELECT COUNT(*) FROM users WHERE tenant_id = 'artlee';

-- Check user_settings count
SELECT COUNT(*) FROM user_settings WHERE tenant_id = 'artlee';

-- Check audit_logs count
SELECT COUNT(*) FROM audit_logs WHERE tenant_id = 'artlee';

-- Expected results should match your backup counts
```

### Step 3: Restore Missing Data (If Needed)

If any data is missing from old database:

```bash
# Import from backup CSV files
# Run in OLD database SQL Editor

-- Example: Restore users
COPY users FROM '/path/to/users_backup_YYYYMMDD.csv' WITH CSV HEADER;

-- Example: Restore user_settings
COPY user_settings FROM '/path/to/user_settings_backup_YYYYMMDD.csv' WITH CSV HEADER;
```

### Step 4: Clear New Database (Optional)

If you want to clean up the new database:

```sql
-- Run in NEW database (fslniuhyunzlfcbxsiol) SQL Editor

-- Drop all tables
DROP TABLE IF EXISTS company_settings CASCADE;
DROP TABLE IF EXISTS system_credentials CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP VIEW IF EXISTS user_management_view CASCADE;
```

### Step 5: Clear Application Cache

```bash
# Clear browser cache
localStorage.clear()
sessionStorage.clear()

# Clear node_modules cache
rm -rf node_modules/.vite
npm run dev
```

### Step 6: Verify Full Rollback

Complete all checks from [Quick Rollback Step 4](#step-4-verify-rollback)

**✅ Full rollback complete!**

---

## Verification Steps

### Database Verification

```sql
-- Run these queries in the ACTIVE database

-- 1. Check users table
SELECT id, email, name, role, tenant_id, created_at
FROM users
WHERE tenant_id = 'artlee'
ORDER BY created_at DESC
LIMIT 5;

-- 2. Check user_settings table
SELECT user_id, theme, fresh_mfa_enabled, retell_api_key IS NOT NULL as has_api_key
FROM user_settings
WHERE tenant_id = 'artlee'
LIMIT 5;

-- 3. Check audit_logs count
SELECT COUNT(*) as total_audit_logs
FROM audit_logs
WHERE tenant_id = 'artlee';

-- 4. Check notes count
SELECT COUNT(*) as total_notes
FROM notes
WHERE tenant_id = 'artlee';
```

### Application Verification

**Test all critical functionality:**

1. **Authentication**
   - [ ] Login with valid credentials
   - [ ] MFA verification (if enabled)
   - [ ] Logout

2. **Dashboard**
   - [ ] Dashboard loads without errors
   - [ ] Charts display data
   - [ ] Metrics calculated correctly

3. **SMS Page**
   - [ ] SMS conversations load
   - [ ] Chat details modal opens
   - [ ] Cost calculations display

4. **Calls Page**
   - [ ] Call records load
   - [ ] Call details accessible
   - [ ] Transcripts display

5. **Settings**
   - [ ] User profile loads
   - [ ] Settings can be updated
   - [ ] API credentials persist

6. **User Management (Super User)**
   - [ ] User list loads
   - [ ] Can create new users
   - [ ] Can edit user roles

---

## Common Issues & Solutions

### Issue 1: "Supabase not configured" Error

**Symptoms:**
- Application shows localStorage-only mode
- No data loading from Supabase

**Solution:**
```bash
# 1. Verify .env.local has correct credentials
cat .env.local | grep VITE_SUPABASE

# 2. Restart dev server
npm run dev

# 3. Clear browser cache
localStorage.clear()
sessionStorage.clear()
```

### Issue 2: "User not found" on Login

**Symptoms:**
- Valid credentials not working
- User exists in old database but not in new

**Solution:**
1. Run Quick Rollback to restore old database connection
2. Re-run migration with correct tenant filtering:
   ```bash
   node migration/02_data_migration.js
   ```

### Issue 3: Missing Audit Logs

**Symptoms:**
- Audit Dashboard empty
- Login history missing

**Solution:**
```sql
-- Check if audit_logs were migrated
SELECT COUNT(*) FROM audit_logs WHERE tenant_id = 'artlee';

-- If count is 0, re-run migration for audit_logs only
-- Or restore from backup CSV
```

### Issue 4: RLS Policy Errors

**Symptoms:**
- "permission denied" errors
- Can't access own data

**Solution:**
```sql
-- Re-run RLS policy creation from schema SQL
-- Or manually grant permissions:

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
```

### Issue 5: WebSocket Connection Failed

**Symptoms:**
- Realtime subscriptions not working
- Console errors about WebSocket

**Solution:**
```javascript
// This is normal and handled by fallback
// Application will use localStorage-only mode
// No action needed if data loads correctly
```

---

## Emergency Contacts

If you need additional support:

1. **Check Supabase Dashboard:**
   - Old DB: https://cpkslvmydfdevdftieck.supabase.co
   - New DB: https://fslniuhyunzlfcbxsiol.supabase.co

2. **Review Migration Logs:**
   - Check console output from migration scripts
   - Review browser console for errors

3. **Database Backups:**
   - Supabase automatically backs up databases
   - Access via Dashboard > Database > Backups

---

## Post-Rollback Actions

After successful rollback:

1. **Document the Issue**
   - Record what went wrong
   - Note any error messages
   - Capture console logs

2. **Fix Root Cause**
   - Review migration scripts
   - Test in development first
   - Update procedures if needed

3. **Plan Next Attempt**
   - Schedule during low-traffic period
   - Ensure all prerequisites met
   - Have rollback plan ready

---

## Rollback Checklist

Use this checklist when performing rollback:

- [ ] Backup current state (if possible)
- [ ] Update .env.local with old credentials
- [ ] Clear browser cache (localStorage + sessionStorage)
- [ ] Restart development server
- [ ] Test login functionality
- [ ] Verify dashboard loads
- [ ] Check SMS and Calls pages
- [ ] Test user settings
- [ ] Verify data integrity
- [ ] Document rollback reason
- [ ] Plan corrective actions

---

**Last Updated:** 2025-10-09
**Migration Version:** 1.0
**Status:** Ready for use

---

## Additional Resources

- **Migration Guide:** `migration/MIGRATION_GUIDE.md`
- **Testing Checklist:** `migration/TESTING_CHECKLIST.md`
- **Schema Documentation:** `migration/01_artlee_schema_creation.sql`
- **Data Migration Script:** `migration/02_data_migration.js`
