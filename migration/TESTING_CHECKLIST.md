# ARTLEE CRM - Post-Migration Testing Checklist

## 📋 Comprehensive Testing Guide

This checklist ensures all ARTLEE CRM functionality works correctly after database migration.

---

## Testing Environment

**Database:** https://fslniuhyunzlfcbxsiol.supabase.co
**Test Date:** _____________
**Tester:** _____________
**Browser:** _____________

---

## Pre-Testing Setup

- [ ] `.env.local` updated with new database credentials
- [ ] Development server restarted (`npm run dev`)
- [ ] Browser cache cleared (localStorage + sessionStorage)
- [ ] Opened browser console to monitor for errors

---

## 1. Authentication & Authorization

### 1.1 User Login

- [ ] **Valid Credentials**: Login with correct email/password works
- [ ] **Invalid Credentials**: Wrong password shows appropriate error
- [ ] **Non-existent User**: Non-existent email shows appropriate error
- [ ] **Session Creation**: User session created successfully
- [ ] **Remember Me**: Session persists across browser restarts (if applicable)

**Test Users:**
- Primary: `guest@guest.com` / `[your_password]`
- Super User: `pierre@phaetonai.com` / `[your_password]`

### 1.2 MFA (Multi-Factor Authentication)

- [ ] **MFA Setup**: Can access MFA setup in settings
- [ ] **QR Code Generation**: QR code displays correctly
- [ ] **TOTP Verification**: 6-digit code verification works
- [ ] **Backup Codes**: Backup codes generated and downloadable
- [ ] **MFA Login**: MFA prompt appears on next login
- [ ] **Backup Code Login**: Can login with backup code
- [ ] **MFA Disable**: Can disable MFA (Super User only)

### 1.3 Logout

- [ ] **Normal Logout**: Logout button works
- [ ] **Emergency Logout**: Ctrl+Shift+L works
- [ ] **Session Cleared**: All session data removed
- [ ] **Redirect to Login**: Redirects to login page
- [ ] **Cannot Access**: Cannot access protected pages after logout

---

## 2. Dashboard Page

### 2.1 Page Loading

- [ ] **Dashboard Loads**: Page loads without errors
- [ ] **No Console Errors**: Browser console shows no errors
- [ ] **Loading States**: Loading spinners display correctly
- [ ] **Data Population**: All metrics populate with data

### 2.2 Metrics Display

- [ ] **Total Calls**: Displays correct call count
- [ ] **Total SMS**: Displays correct SMS/chat count
- [ ] **Call Costs**: Shows total call costs in CAD
- [ ] **SMS Costs**: Shows total SMS costs in CAD
- [ ] **Combined Costs**: Shows total combined costs
- [ ] **Success Rate**: Displays call success rate percentage

### 2.3 Charts & Visualizations

- [ ] **Bar Charts**: Call & SMS volume charts render
- [ ] **Pie Charts**: Cost distribution charts display
- [ ] **Line Charts**: Trend charts show data
- [ ] **Area Charts**: Cumulative activity charts work
- [ ] **Chart Interactions**: Hover tooltips display correctly
- [ ] **Responsive**: Charts resize with browser window

### 2.4 Date Range Filtering

- [ ] **Today**: Filters data for today
- [ ] **This Week**: Shows current week data
- [ ] **Last Week**: Shows previous week data
- [ ] **This Month**: Shows current month data
- [ ] **This Year**: Shows year-to-date data
- [ ] **Custom Range**: Custom date picker works
- [ ] **Data Updates**: Charts update when date range changes

---

## 3. SMS Page

### 3.1 Page Loading

- [ ] **SMS Page Loads**: Page loads without errors
- [ ] **Chat List**: SMS conversations display in list
- [ ] **Loading States**: Shows loading spinner while fetching
- [ ] **Empty State**: Handles no SMS gracefully

### 3.2 Chat List

- [ ] **Chat Preview**: Shows patient ID and last message
- [ ] **Timestamp**: Displays conversation timestamp
- [ ] **Segment Count**: Shows SMS segment count
- [ ] **Cost Display**: Shows cost in CAD
- [ ] **Sorting**: Chats sorted by most recent
- [ ] **Search**: Can search/filter chats

### 3.3 Chat Details Modal

- [ ] **Modal Opens**: Clicking chat opens detail modal
- [ ] **Patient Info**: Shows patient ID and metadata
- [ ] **Message Thread**: Full conversation displays
- [ ] **Message Roles**: Patient/Assistant labels correct
- [ ] **Timestamps**: Message timestamps display
- [ ] **Sentiment**: Sentiment analysis shows (if available)
- [ ] **Scroll**: Can scroll through long conversations

### 3.4 Cost Calculations

- [ ] **Segment Calculation**: SMS segments calculated correctly
- [ ] **Twilio Cost**: Twilio SMS cost displays
- [ ] **Retell AI Cost**: Retell AI chat cost displays
- [ ] **Combined Cost**: Total cost combines both correctly
- [ ] **Currency**: All costs show CAD
- [ ] **Bulk Loading**: Cost calculation works for all chats

### 3.5 PDF Export

- [ ] **Single Export**: Can export individual chat to PDF
- [ ] **Bulk Export**: Can export multiple chats to PDF
- [ ] **PDF Content**: PDF contains all chat data
- [ ] **PDF Analysis**: PDF includes cost analysis
- [ ] **Download Works**: PDF downloads successfully

---

## 4. Calls Page

### 4.1 Page Loading

- [ ] **Calls Page Loads**: Page loads without errors
- [ ] **Call List**: Call records display
- [ ] **Loading States**: Shows loading during fetch
- [ ] **Empty State**: Handles no calls gracefully

### 4.2 Call List

- [ ] **Call Details**: Shows call duration, timestamp
- [ ] **Patient Info**: Displays patient ID
- [ ] **Call Status**: Shows success/failed status
- [ ] **Cost Display**: Shows cost in CAD
- [ ] **Sorting**: Calls sorted by most recent

### 4.3 Call Details

- [ ] **Details Modal**: Call details modal opens
- [ ] **Transcript**: Call transcript displays
- [ ] **Recording**: Audio player works (if available)
- [ ] **Analysis**: Call analysis displays
- [ ] **Metadata**: All call metadata shown

### 4.4 Metrics

- [ ] **Total Calls**: Displays total call count
- [ ] **Average Duration**: Shows avg call duration
- [ ] **Average Cost**: Shows avg cost per call
- [ ] **Highest Cost**: Shows highest cost call
- [ ] **Success Rate**: Displays success percentage

---

## 5. Settings Page

### 5.1 Profile Settings

- [ ] **Page Loads**: Settings page loads
- [ ] **Full Name**: Can edit and save full name
- [ ] **Display Name**: Can edit display name
- [ ] **Department**: Can edit department
- [ ] **Phone**: Can edit phone number
- [ ] **Bio**: Can edit bio
- [ ] **Location**: Can edit location
- [ ] **Profile Save**: Changes persist after save
- [ ] **Header Updates**: Display name updates in header

### 5.2 Avatar Upload

- [ ] **Upload Button**: Upload avatar button works
- [ ] **File Selection**: Can select image file
- [ ] **Upload Progress**: Shows upload progress
- [ ] **Avatar Display**: New avatar displays
- [ ] **Persistence**: Avatar persists after reload
- [ ] **Super User Role**: Role preserved after upload (KNOWN ISSUE - may be removed)

### 5.3 API Configuration

- [ ] **Retell API Key**: Can enter and save API key
- [ ] **Call Agent ID**: Can enter and save Call Agent ID
- [ ] **SMS Agent ID**: Can enter and save SMS Agent ID
- [ ] **Credentials Persist**: Credentials saved to database
- [ ] **Cross-Device Sync**: Credentials accessible from other devices

### 5.4 Theme Settings

- [ ] **Light Mode**: Can switch to light mode
- [ ] **Dark Mode**: Can switch to dark mode
- [ ] **Theme Persists**: Theme preference saved
- [ ] **QR Code Readable**: QR codes readable in both modes

### 5.5 Notification Settings

- [ ] **Email Toggle**: Can enable/disable email notifications
- [ ] **Toast Toggle**: Can enable/disable toast notifications
- [ ] **Sound Toggle**: Can enable/disable notification sounds
- [ ] **Settings Save**: Notification preferences persist

---

## 6. User Management (Super User Only)

### 6.1 Page Access

- [ ] **Super User Access**: Super User can access user management
- [ ] **Regular User Denied**: Regular users cannot access
- [ ] **Tab Visible**: User Management tab visible for Super Users

### 6.2 User List

- [ ] **Users Display**: All users display in list
- [ ] **User Details**: Shows email, name, role, status
- [ ] **Last Login**: Shows last login timestamp
- [ ] **Search**: Can search users
- [ ] **Filter**: Can filter by role/status

### 6.3 User Creation

- [ ] **Add User Form**: Add user form displays
- [ ] **Email Validation**: Email validation works
- [ ] **Password Requirements**: Password requirements enforced
- [ ] **Role Assignment**: Can assign role (user/super_user)
- [ ] **User Created**: New user created successfully
- [ ] **Appears in List**: New user appears in user list

### 6.4 User Editing

- [ ] **Edit Button**: Edit user button works
- [ ] **Change Name**: Can change user name
- [ ] **Change Role**: Can change user role
- [ ] **Enable/Disable**: Can enable/disable user
- [ ] **Changes Save**: Edits persist
- [ ] **First Super User Protected**: Cannot demote first Super User

### 6.5 User Deletion

- [ ] **Delete Button**: Delete user button works
- [ ] **Confirmation**: Deletion requires confirmation
- [ ] **User Removed**: User removed from list
- [ ] **Data Cascade**: User data properly handled

---

## 7. Audit Dashboard (Super User Only)

### 7.1 Page Access

- [ ] **Super User Access**: Super User can access audit logs
- [ ] **Regular User Denied**: Regular users cannot access
- [ ] **Page Loads**: Audit dashboard loads without errors

### 7.2 Audit Log Display

- [ ] **Logs Display**: Audit logs display in table
- [ ] **User Name**: User names show in plain text
- [ ] **Action Type**: Actions clearly labeled
- [ ] **Timestamp**: Timestamps display correctly
- [ ] **Outcome**: Success/failure indicators work
- [ ] **Failure Reason**: Failure reasons display (plain text)

### 7.3 Filtering & Search

- [ ] **Date Filter**: Can filter by date range
- [ ] **User Filter**: Can filter by specific user
- [ ] **Action Filter**: Can filter by action type
- [ ] **Search**: Can search audit logs
- [ ] **Export**: Can export audit logs (if implemented)

### 7.4 Login History

- [ ] **Login History Modal**: Login history modal opens
- [ ] **User Logins**: Shows user login attempts
- [ ] **Success/Failures**: Distinguishes successful/failed logins
- [ ] **Timestamps**: Login timestamps accurate
- [ ] **IP Addresses**: Source IPs displayed (if available)

---

## 8. Cross-Device Synchronization

### 8.1 User Settings Sync

- [ ] **Device A**: Update settings on Device A
- [ ] **Device B**: Settings appear on Device B
- [ ] **Sync Delay**: Sync happens within reasonable time
- [ ] **No Conflicts**: No data conflicts occur

### 8.2 Notes Sync

- [ ] **Create Note**: Create note on Device A
- [ ] **Appears**: Note appears on Device B
- [ ] **Edit Note**: Edit note on Device A
- [ ] **Updates**: Edit reflected on Device B
- [ ] **Delete Note**: Delete note on Device A
- [ ] **Removed**: Note removed from Device B

### 8.3 Profile Sync

- [ ] **Update Profile**: Update profile on Device A
- [ ] **Syncs**: Profile updates on Device B
- [ ] **Avatar Sync**: Avatar syncs across devices
- [ ] **No Data Loss**: No profile data lost during sync

---

## 9. Performance Testing

### 9.1 Page Load Times

- [ ] **Dashboard**: Loads in < 3 seconds
- [ ] **SMS Page**: Loads in < 3 seconds
- [ ] **Calls Page**: Loads in < 3 seconds
- [ ] **Settings**: Loads in < 2 seconds
- [ ] **User Management**: Loads in < 2 seconds

### 9.2 Large Dataset Handling

- [ ] **100+ SMS**: Handles 100+ chats without lag
- [ ] **100+ Calls**: Handles 100+ calls without lag
- [ ] **1000+ Audit Logs**: Audit logs paginate correctly
- [ ] **Smooth Scrolling**: Lists scroll smoothly

### 9.3 Network Conditions

- [ ] **Fast Connection**: Works normally
- [ ] **Slow Connection**: Shows loading states
- [ ] **Offline**: Graceful fallback to localStorage
- [ ] **Reconnect**: Recovers when connection restored

---

## 10. Security Testing

### 10.1 Authentication

- [ ] **Session Timeout**: Session expires after inactivity
- [ ] **Token Validation**: Invalid tokens rejected
- [ ] **Role Enforcement**: Role-based access enforced
- [ ] **XSS Protection**: No XSS vulnerabilities

### 10.2 Data Access

- [ ] **User Isolation**: Users only see own data
- [ ] **RLS Policies**: Row Level Security enforced
- [ ] **API Key Protection**: API keys not exposed in logs
- [ ] **PHI Encryption**: Sensitive data encrypted

### 10.3 Audit Logging

- [ ] **Actions Logged**: All sensitive actions logged
- [ ] **Login Tracked**: Login attempts logged
- [ ] **User Name Plain Text**: User names stored unencrypted (not PHI)
- [ ] **Failure Reasons**: Error messages logged correctly

---

## 11. Error Handling

### 11.1 Network Errors

- [ ] **API Failure**: Shows user-friendly error message
- [ ] **Timeout**: Handles request timeouts gracefully
- [ ] **Offline Mode**: Falls back to localStorage
- [ ] **Retry Logic**: Retries failed requests

### 11.2 Validation Errors

- [ ] **Form Validation**: Client-side validation works
- [ ] **Server Validation**: Server errors handled
- [ ] **Error Messages**: Clear error messages displayed
- [ ] **Error Recovery**: Can recover from errors

### 11.3 Console Errors

- [ ] **No JavaScript Errors**: Console clean of JS errors
- [ ] **No CORS Errors**: No cross-origin errors
- [ ] **No CSP Violations**: No Content Security Policy violations
- [ ] **Warnings Only**: Only benign warnings present

---

## 12. Data Integrity

### 12.1 User Data

- [ ] **User Count**: Matches pre-migration count
- [ ] **Emails Correct**: All user emails present
- [ ] **Roles Preserved**: User roles correct
- [ ] **Super Users**: All super users maintained

### 12.2 Settings Data

- [ ] **Settings Count**: Matches pre-migration count
- [ ] **MFA Status**: MFA settings preserved
- [ ] **API Credentials**: API keys intact
- [ ] **Preferences**: User preferences maintained

### 12.3 Audit Data

- [ ] **Audit Count**: Matches pre-migration count (or close)
- [ ] **Old Logs**: Historical logs accessible
- [ ] **New Logs**: New actions being logged
- [ ] **Timestamps**: Timestamps accurate

### 12.4 Notes Data

- [ ] **Notes Count**: Matches pre-migration count
- [ ] **Content Intact**: Note content complete
- [ ] **Metadata**: Note metadata preserved
- [ ] **Attachments**: Any attachments accessible (if applicable)

---

## 13. Tenant Isolation Verification

### 13.1 Data Separation

- [ ] **tenant_id Field**: All records have tenant_id = 'artlee'
- [ ] **No Cross-Tenant**: No MedEx/CareXPS data visible
- [ ] **Query Filtering**: All queries filter by tenant_id
- [ ] **RLS Enforcement**: Tenant isolation enforced at database level

### 13.2 API Queries

- [ ] **Users Query**: Only returns ARTLEE users
- [ ] **Settings Query**: Only returns ARTLEE settings
- [ ] **Audit Logs**: Only shows ARTLEE audit entries
- [ ] **Notes Query**: Only returns ARTLEE notes

---

## 14. Browser Compatibility

### 14.1 Chrome/Edge

- [ ] **Login Works**: Can login successfully
- [ ] **All Pages Load**: All pages load correctly
- [ ] **No Visual Issues**: UI renders properly
- [ ] **No Console Errors**: Console clean

### 14.2 Firefox

- [ ] **Login Works**: Can login successfully
- [ ] **All Pages Load**: All pages load correctly
- [ ] **No Visual Issues**: UI renders properly
- [ ] **No Console Errors**: Console clean

### 14.3 Safari (if applicable)

- [ ] **Login Works**: Can login successfully
- [ ] **All Pages Load**: All pages load correctly
- [ ] **No Visual Issues**: UI renders properly
- [ ] **No Console Errors**: Console clean

---

## 15. Deployment Verification (After Production Deploy)

### 15.1 Azure Static Web Apps

- [ ] **Build Succeeds**: Azure build completes without errors
- [ ] **Deployment**: Application deployed successfully
- [ ] **HTTPS**: Site accessible via HTTPS
- [ ] **Environment Variables**: Production env vars injected correctly

### 15.2 Production Testing

- [ ] **Production Login**: Can login to production site
- [ ] **Data Loads**: Production data loads correctly
- [ ] **No Errors**: No console errors in production
- [ ] **Performance**: Production performance acceptable

---

## Testing Summary

**Total Tests:** ___ / ___
**Passed:** ___
**Failed:** ___
**Skipped:** ___

**Critical Issues Found:**

1. _______________________________
2. _______________________________
3. _______________________________

**Non-Critical Issues:**

1. _______________________________
2. _______________________________
3. _______________________________

**Overall Status:** ⬜ PASS ⬜ FAIL ⬜ PASS WITH ISSUES

**Tester Signature:** _______________
**Date Completed:** _______________

---

## Notes

_Add any additional notes, observations, or recommendations here:_

---

**Last Updated:** 2025-10-09
**Migration Version:** 1.0
