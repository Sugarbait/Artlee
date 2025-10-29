# ARTLEE CRM - Database Migration Package

## 📦 Complete Migration Toolkit

This directory contains everything needed to migrate ARTLEE CRM from the shared multi-tenant database to a dedicated Supabase database.

---

## 🚀 Quick Start

**To perform the migration:**

1. **Read the Migration Guide** (Start here!)
   ```bash
   cat migration/MIGRATION_GUIDE.md
   ```

2. **Run Schema Setup** (Manual SQL recommended)
   - Open new database SQL Editor
   - Copy contents of `01_artlee_schema_creation.sql`
   - Execute in SQL Editor

3. **Run Data Migration**
   ```bash
   node migration/02_data_migration.js
   ```

4. **Test Application**
   - `.env.local` already updated with new credentials
   - Restart dev server: `npm run dev`
   - Follow testing checklist

5. **Deploy to Production**
   - Update GitHub secrets
   - Push to main branch

---

## 📁 Files in This Directory

### Core Migration Files

| File | Purpose | Usage |
|------|---------|-------|
| `README.md` | This file - overview | Read first |
| `MIGRATION_GUIDE.md` | Complete step-by-step guide | **START HERE** |
| `01_artlee_schema_creation.sql` | Database schema SQL | Run in new DB |
| `02_data_migration.js` | Data migration script | `node 02_data_migration.js` |
| `00_run_schema_setup.js` | Automated schema setup (optional) | `node 00_run_schema_setup.js` |

### Support Documentation

| File | Purpose | When to Use |
|------|---------|-------------|
| `ROLLBACK_PROCEDURES.md` | Emergency rollback guide | If migration fails |
| `TESTING_CHECKLIST.md` | Comprehensive test suite | After migration |

---

## 🗄️ Database Information

### Old Database (Source)
- **URL:** https://cpkslvmydfdevdftieck.supabase.co
- **Type:** Shared multi-tenant
- **Tenants:** ARTLEE, MedEx, CareXPS
- **Isolation:** Application-level (tenant_id filtering)

### New Database (Target)
- **URL:** https://fslniuhyunzlfcbxsiol.supabase.co
- **Type:** Dedicated ARTLEE database
- **Tenants:** ARTLEE only
- **Isolation:** Physical database separation

---

## 🔧 Prerequisites

**Before starting:**

- [ ] Node.js 18+ installed
- [ ] `@supabase/supabase-js` npm package
- [ ] Access to both Supabase databases
- [ ] Backup of current data
- [ ] 1-2 hours for migration and testing

**Install dependencies:**
```bash
npm install @supabase/supabase-js
```

---

## 📋 Migration Process Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     MIGRATION WORKFLOW                      │
└─────────────────────────────────────────────────────────────┘

Step 1: Pre-Migration
├── Backup current data
├── Document record counts
└── Install dependencies

Step 2: Schema Setup
├── Open new database SQL Editor
├── Copy 01_artlee_schema_creation.sql
├── Execute SQL
└── Verify tables created

Step 3: Data Migration
├── Run: node 02_data_migration.js
├── Monitor progress
└── Verify record counts match

Step 4: Configuration
├── .env.local ALREADY UPDATED ✅
├── Restart dev server
└── Clear browser cache

Step 5: Testing
├── Follow TESTING_CHECKLIST.md
├── Verify all critical functionality
└── Check data integrity

Step 6: Production Deploy
├── Update GitHub secrets
├── Push to main branch
└── Monitor deployment

SUCCESS! ✅
```

---

## ✅ Success Criteria

**Migration is successful when:**

### Database ✅
- All tables created in new database
- All ARTLEE data migrated (tenant_id='artlee')
- Record counts match pre-migration
- RLS policies enforced

### Application ✅
- Login works
- Dashboard loads with data
- SMS page shows conversations
- Calls page shows records
- Settings accessible
- User management functional

### Production ✅
- Production site loads
- Production login works
- No console errors
- Performance acceptable

---

## 🔄 Rollback Plan

**If anything goes wrong:**

See `ROLLBACK_PROCEDURES.md` for detailed steps.

**Quick rollback (5 minutes):**

1. Restore old credentials in `.env.local`
2. Clear browser cache
3. Restart server

**Full rollback instructions:** `migration/ROLLBACK_PROCEDURES.md`

---

## 📊 What Gets Migrated

| Table | Description | Approximate Size |
|-------|-------------|------------------|
| `users` | User accounts | ~5-10 records |
| `user_settings` | User preferences, MFA, API keys | ~5-10 records |
| `user_profiles` | Extended profile data | ~5-10 records |
| `audit_logs` | HIPAA compliance logs | ~1000+ records |
| `notes` | Cross-device notes | ~10-50 records |
| `system_credentials` | API credentials | ~3-5 records |
| `company_settings` | Company branding | ~1 record |

**All records filtered by:** `tenant_id = 'artlee'`

---

## 🔐 Security Notes

### Credentials in Migration Scripts

**Scripts contain database credentials:**
- Old database credentials (read-only access)
- New database credentials (write access)
- **Safe for local use** - not committed to version control
- **Review before committing** to public repositories

### Data Protection

- All PHI data encrypted in transit (TLS)
- No PHI exposed in migration logs
- Audit logs maintained during migration
- User credentials preserved with encryption

### Post-Migration Cleanup

- Keep old database as backup for 30 days
- Remove old credentials from active configs
- Archive migration scripts after success

---

## 🧪 Testing Overview

**Use comprehensive testing checklist:**

### Critical Tests (Must Pass)
- ✅ Authentication (login/logout/MFA)
- ✅ Dashboard metrics and charts
- ✅ SMS page with conversations
- ✅ Calls page with records
- ✅ Settings page functionality
- ✅ User management (Super User)
- ✅ Cross-device sync
- ✅ Audit logging
- ✅ Data integrity verification

**Full checklist:** `migration/TESTING_CHECKLIST.md` (250+ test cases)

---

## ⏱️ Timeline

**Estimated Duration:** 1-2 hours

| Phase | Time | Description |
|-------|------|-------------|
| Pre-migration | 15 min | Backup and prep |
| Schema setup | 10 min | Create tables |
| Data migration | 10-20 min | Transfer data |
| Configuration | 5 min | Update configs |
| Local testing | 20-30 min | Verify functionality |
| Comprehensive testing | 30-60 min | Full test suite |
| Production deploy | 10 min | GitHub → Azure |

**Total:** 100-150 minutes

---

## 🆘 Troubleshooting

### Common Issues

**Issue:** Migration script fails
- **Fix:** Check database connectivity, verify credentials

**Issue:** "Supabase not configured"
- **Fix:** Restart dev server, check .env.local

**Issue:** Data not loading
- **Fix:** Verify data migrated, check RLS policies

**Issue:** User not found
- **Fix:** Verify user migrated with correct tenant_id

**Full troubleshooting guide:** `MIGRATION_GUIDE.md` → Troubleshooting section

---

## 📞 Support Resources

### Documentation
- **Primary Guide:** `MIGRATION_GUIDE.md` (comprehensive)
- **Rollback Guide:** `ROLLBACK_PROCEDURES.md`
- **Testing Guide:** `TESTING_CHECKLIST.md`
- **Main Docs:** `../CLAUDE.md` (project overview)

### Database Dashboards
- **Old DB:** https://cpkslvmydfdevdftieck.supabase.co
- **New DB:** https://fslniuhyunzlfcbxsiol.supabase.co

### Application
- **Dev:** http://localhost:3000
- **Prod:** https://artlee.nexasync.ca

---

## 🎯 Next Steps

**Haven't migrated yet?**
1. Read `MIGRATION_GUIDE.md` thoroughly
2. Backup current data
3. Follow migration steps
4. Test thoroughly
5. Deploy to production

**Migration complete?**
1. Monitor application for 24-48 hours
2. Check user feedback
3. Verify audit logs
4. Update documentation
5. Archive migration files

**Migration failed?**
1. Check `ROLLBACK_PROCEDURES.md`
2. Restore old database connection
3. Review error messages
4. Fix issues and retry

---

## 📝 Migration Checklist

**Use this quick checklist:**

### Pre-Migration
- [ ] Read MIGRATION_GUIDE.md
- [ ] Backup current data
- [ ] Install dependencies
- [ ] Document record counts

### Migration
- [ ] Run schema setup (manual SQL recommended)
- [ ] Run data migration script
- [ ] Verify record counts match
- [ ] Configuration already updated ✅

### Testing
- [ ] Restart dev server
- [ ] Clear browser cache
- [ ] Test login
- [ ] Test dashboard
- [ ] Test SMS/Calls pages
- [ ] Run comprehensive tests

### Production
- [ ] Update GitHub secrets
- [ ] Deploy to production
- [ ] Test production site
- [ ] Monitor for issues

### Cleanup
- [ ] Document any issues
- [ ] Keep old DB as backup
- [ ] Archive migration files
- [ ] Update documentation

---

## 🚨 Important Notes

### ⚠️ Before You Start
1. **ALWAYS backup first** - Migration is irreversible without backups
2. **Test locally first** - Never migrate directly to production
3. **Have rollback ready** - Know how to revert if needed
4. **Schedule wisely** - Migrate during low-traffic periods

### ✅ Key Points
- `.env.local` has been updated with new credentials
- All migration scripts are ready to run
- Comprehensive documentation provided
- Rollback procedures documented
- Testing checklist comprehensive

### 🎉 Benefits After Migration
- ✅ Complete data isolation from MedEx/CareXPS
- ✅ Independent database scaling
- ✅ Simplified maintenance
- ✅ Improved security posture
- ✅ Better performance monitoring

---

## 📌 File Structure

```
migration/
├── README.md                          ← You are here
├── MIGRATION_GUIDE.md                ← START HERE (step-by-step)
├── ROLLBACK_PROCEDURES.md            ← Emergency rollback
├── TESTING_CHECKLIST.md              ← Post-migration tests
├── 00_run_schema_setup.js            ← Automated setup (optional)
├── 01_artlee_schema_creation.sql     ← Database schema
└── 02_data_migration.js              ← Data migration script

../
├── .env.local                         ← UPDATED with new DB ✅
├── src/config/supabase.ts            ← Auto-detects new DB ✅
└── CLAUDE.md                          ← Project documentation
```

---

## 📅 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-09 | Initial migration package created |
| | | - Complete schema SQL |
| | | - Data migration script |
| | | - Comprehensive documentation |
| | | - Configuration updates |

---

## 👥 Credits

**Migration Package Created By:** Claude AI Assistant
**Authorization:** ARTLEE CRM Owner
**Date:** October 9, 2025
**Purpose:** Migrate ARTLEE to dedicated Supabase database
**Status:** ✅ Ready for Execution

---

## 🚀 Ready to Migrate?

**Follow these steps:**

1. **📖 Read:** `MIGRATION_GUIDE.md` (comprehensive walkthrough)
2. **💾 Backup:** Create database backup snapshot
3. **🗄️ Schema:** Run `01_artlee_schema_creation.sql` in new DB
4. **📦 Migrate:** Run `node 02_data_migration.js`
5. **🧪 Test:** Follow `TESTING_CHECKLIST.md`
6. **🚀 Deploy:** Update GitHub secrets and deploy

**Questions? Refer to `MIGRATION_GUIDE.md` for detailed instructions!**

---

**Last Updated:** 2025-10-09
**Package Version:** 1.0
**Status:** Production Ready

---

## License & Support

This migration package is part of ARTLEE CRM and inherits the same licensing and support terms as the main project.

**Good luck with your migration! 🎉**
