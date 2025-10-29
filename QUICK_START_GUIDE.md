# Phaeton AI CRM - Quick Start Guide

## ✅ Setup Complete!

Your Phaeton AI CRM is now running and ready to use!

---

## 🚀 Access Your CRM

**Development Server**: `http://localhost:3001/`

Open this URL in your browser to access the application.

---

## 👤 Create Your First User (Super User)

1. **Navigate to Registration Page**
   - The app will redirect you to the login page
   - Click on "Register" or "Create Account"

2. **Fill in Registration Details**
   - Full Name
   - Email Address
   - Password (must meet security requirements)
   - Department (optional)
   - Phone Number (optional)

3. **Automatic Super User Assignment**
   - The **first user** you create will automatically become a **Super User**
   - This user will have full admin rights
   - They can create and manage other users
   - Tenant ID will automatically be set to `phaeton_ai`

---

## 🔒 Tenant Isolation Verified

Your Phaeton AI CRM is completely isolated:

✅ **Tenant ID**: `phaeton_ai`
✅ **Database**: Supabase at `cpkslvmydfdevdftieck.supabase.co`
✅ **Data Isolation**: All queries automatically filter by `tenant_id = 'phaeton_ai'`
✅ **No Cross-Tenant Access**: Completely separate from ARTLEE and other tenants

You can verify tenant filtering in the browser console - look for messages like:
```
🏢 [TENANT] getCurrentTenantId() called - Returning: "phaeton_ai"
```

---

## 📋 What You Can Do Next

### 1. **Explore the Dashboard**
- View analytics and metrics
- See call and SMS statistics
- Monitor system performance

### 2. **Configure Services** (Optional)
Go to **Settings** to configure:
- **Retell AI**: Add API key and Agent ID for voice calls
- **Email Notifications**: Already configured with Hostinger SMTP
- **Multi-Factor Authentication (MFA)**: Enable for enhanced security

### 3. **Create Additional Users**
As a Super User, you can:
- Go to **Settings → User Management**
- Create new users with different roles
- Assign permissions and access levels

### 4. **Test Features**
- Make test calls (requires Retell AI configuration)
- Send SMS messages (Twilio already configured)
- Create notes and tasks
- Generate reports

---

## 🔧 Development Commands

All commands should be run from: `I:\Apps Back Up\Phaeton AI CRM`

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run with TypeScript checking
npm run build:check

# Run tests
npm run test

# Lint code
npm run lint

# Email server (HIPAA-compliant notifications)
npm run email-server
```

---

## 🗄️ Database Information

**Connection Details**:
- URL: `https://cpkslvmydfdevdftieck.supabase.co`
- Tenant ID: `phaeton_ai`
- All tables use Row Level Security (RLS)

**Shared Tables** (isolated by tenant_id):
- `users` - User accounts and profiles
- `calls` - Voice call records
- `sms_messages` - SMS conversations
- `notes` - Cross-device synchronized notes
- `user_settings` - User preferences
- `audit_logs` - HIPAA-compliant audit trail

---

## 🛡️ Security Features

✅ **HIPAA Compliance**: All PHI data is encrypted
✅ **MFA Support**: Multi-factor authentication available
✅ **Audit Logging**: Complete audit trail per HIPAA Security Rule
✅ **Session Management**: Configurable timeout (default 15 min)
✅ **Emergency Logout**: Ctrl+Shift+L for immediate logout

---

## 🔍 Troubleshooting

### Port Already in Use
If port 3001 is also in use, Vite will automatically find the next available port. Check the console output for the actual port number.

### Database Connection Issues
1. Verify `.env.local` has correct Supabase credentials
2. Check if Supabase project is active
3. Look for tenant filtering logs in browser console

### First User Not Getting Super User Role
1. Make sure you're creating the FIRST user in the system
2. Check that no other users exist with `tenant_id = 'phaeton_ai'`
3. Verify tenant configuration in `src/config/tenantConfig.ts`

---

## 📚 Additional Resources

- **Full Setup Documentation**: `PHAETON_AI_SETUP_COMPLETE.md`
- **Main README**: `README.md`
- **Tenant Configuration**: `src/config/tenantConfig.ts`
- **Environment Variables**: `.env.local`

---

## ✅ Setup Checklist

- [x] Dependencies installed
- [x] Development server running on port 3001
- [x] Tenant ID configured as 'phaeton_ai'
- [x] Database credentials configured
- [x] Branding updated to Phaeton AI CRM
- [ ] First Super User created
- [ ] Retell AI configured (optional)
- [ ] Additional users created (optional)

---

## 🎉 You're All Set!

Your Phaeton AI CRM is fully configured and ready to use. Head over to **http://localhost:3001/** and create your first user to get started!

**Questions or Issues?**
- Check the console logs for detailed error messages
- Review environment variables in `.env.local`
- Verify tenant configuration in `src/config/tenantConfig.ts`

---

**Last Updated**: 2025-10-09
**Status**: ✅ Ready for Use
