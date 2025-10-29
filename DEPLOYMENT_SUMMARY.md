# Supabase Edge Function Deployment Summary

## File Being Deployed
`supabase/functions/send-invoice-email/index.ts`

## What This Function Does
This is a Supabase Edge Function that sends invoice notification emails via Resend API. It runs on Supabase's servers (not your local machine) and is triggered when invoices are generated.

## Recent Changes Made (Ready to Deploy)

### 1. **Updated Email Subject Line** (Line 441)
```typescript
subject: `Your Phaeton AI Service Cost Invoice - ${date_range} - ${total_amount}`
```
**Before:** `Invoice in_1SNQKMJHsrdoo9TWDKFS3G63 - CAD $2.61`
**After:** `Your Phaeton AI Service Cost Invoice - Jan 15 - Feb 14, 2025 - CAD $2.61`

### 2. **Fixed Unclickable Link Issue** (Lines 178-195)
Added CSS properties to ensure "Pay Invoice in Stripe" button is clickable in all email clients:
- `cursor: pointer` - Shows hand cursor on hover
- `pointer-events: auto` - Ensures link is clickable
- `text-decoration: none !important` - Prevents underline
- `-webkit-user-select: none` - Better mobile support

### 3. **Enhanced Debugging** (Lines 410-426)
Added logging to track:
- Invoice URL being sent
- PDF download link being sent
- Warning if invoice URL is empty

## Environment Variables Required
The Edge Function needs these variables (already configured in Supabase):
- `RESEND_API_KEY` - Your Resend API key for sending emails

## Email Template Features
The function includes a professional HTML email template with:
- ARTLEE branding and logo
- Invoice summary with date range
- Cost breakdown (calls + SMS)
- "Pay Invoice in Stripe" button (clickable)
- "Download PDF Details" button
- Mobile-responsive design
- Professional footer with contact info

## How It's Triggered
When you click "Generate Invoice" in the Dashboard:
1. Dashboard creates Stripe invoice and uploads PDF to Supabase Storage
2. Dashboard calls this Edge Function via `invoiceEmailService.sendInvoiceEmail()`
3. Edge Function receives invoice data
4. Edge Function sends beautiful HTML email via Resend
5. Customer receives email with clickable payment link

## Deployment Command
To deploy these changes to Supabase:
```bash
npx supabase login
npx supabase functions deploy send-invoice-email
```

## Testing After Deployment
1. Generate an invoice in the Dashboard
2. Check your email for subject line format
3. Verify "Pay Invoice in Stripe" button is clickable
4. Check Supabase Function Logs for debug output

## Support
If issues occur after deployment:
- Check Supabase Edge Function logs
- Verify RESEND_API_KEY is configured
- Ensure invoice_url is being passed correctly from Dashboard
