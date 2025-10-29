import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend@2.0.0'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ARTLEE Invoice</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            max-width: 650px;
            margin: 0 auto;
            padding: 40px 20px;
            background-color: #f8f9fa;
            overflow-x: hidden;
        }

        * {
            box-sizing: border-box;
        }

        .email-wrapper {
            background: #ffffff;
            border: 1px solid #e1e4e8;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
            overflow-x: hidden;
        }

        .header {
            background: #ffffff;
            color: #000000;
            padding: 40px 40px 35px 40px;
            border-bottom: 3px solid #e2e8f0;
            text-align: center;
        }

        .header a,
        .header a:link,
        .header a:visited,
        .header a:hover,
        .header a:active {
            color: #000000 !important;
            text-decoration: none !important;
            pointer-events: none;
            cursor: default;
        }

        .header-logo {
            max-width: 200px;
            height: auto;
            margin: 0 auto 20px auto;
            display: block;
        }

        .header h1 {
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 600;
            letter-spacing: -0.5px;
        }

        .header p {
            margin: 0;
            font-size: 14px;
            color: #000000;
            font-weight: 400;
        }

        .content {
            padding: 40px;
            overflow-x: hidden;
        }

        .greeting {
            font-size: 15px;
            color: #2d3748;
            margin-bottom: 25px;
            line-height: 1.5;
            text-align: center;
        }

        .invoice-summary {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            padding: 30px;
            margin: 30px 0;
        }

        .invoice-id {
            font-size: 11px;
            color: #718096;
            margin-bottom: 20px;
            font-weight: 500;
            letter-spacing: 0.3px;
            word-break: break-all;
            text-align: center;
        }

        .amount-section {
            text-align: center;
            padding: 25px 0;
            border-top: 2px solid #e2e8f0;
            border-bottom: 2px solid #e2e8f0;
            margin: 20px 0;
        }

        .amount-label {
            font-size: 12px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .amount {
            font-size: 42px;
            font-weight: 700;
            color: #1e3a5f;
            margin: 0;
        }

        .breakdown {
            margin-top: 25px;
        }

        .breakdown-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid #e2e8f0;
        }

        .breakdown-item:first-child {
            padding-top: 0;
        }

        .breakdown-item:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }

        .breakdown-left {
            display: flex;
            flex-direction: column;
        }

        .breakdown-label {
            color: #2d3748;
            font-size: 15px;
            font-weight: 500;
        }

        .breakdown-subtext {
            font-size: 13px;
            color: #718096;
            margin-top: 2px;
        }

        .breakdown-value {
            font-weight: 600;
            font-size: 16px;
            color: #1a1a1a;
        }

        .action-section {
            margin: 35px 0;
        }

        .button {
            display: block;
            width: 100%;
            padding: 16px 24px;
            text-align: center;
            text-decoration: none;
            font-weight: 600;
            font-size: 15px;
            transition: all 0.2s ease;
            margin-bottom: 12px;
            border: 2px solid transparent;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .btn-primary {
            background: #1e3a5f;
            color: #ffffff !important;
        }

        .btn-primary:hover {
            background: #2c5282;
        }

        .btn-secondary {
            background: #ffffff;
            color: #1e3a5f !important;
            border: 2px solid #cbd5e0;
        }

        .btn-secondary:hover {
            border-color: #1e3a5f;
            background: #f7fafc;
        }

        .info-box {
            background: #f7fafc;
            border-left: 3px solid #4299e1;
            padding: 16px 20px;
            margin: 30px 0;
            font-size: 14px;
            color: #2d3748;
        }

        .info-box strong {
            color: #1a1a1a;
        }

        .closing {
            margin-top: 35px;
            font-size: 15px;
            color: #2d3748;
            text-align: center;
        }

        .footer {
            background: #f7fafc;
            padding: 30px 40px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
        }

        .footer-brand {
            font-weight: 600;
            color: #1e3a5f;
            font-size: 15px;
            margin-bottom: 8px;
        }

        .footer-brand a {
            color: #1e3a5f;
            text-decoration: none;
        }

        .footer-brand a:hover {
            text-decoration: underline;
        }

        .footer p {
            margin: 5px 0;
            font-size: 13px;
            color: #718096;
        }

        .footer a {
            color: #1e3a5f;
            text-decoration: none;
            font-weight: 500;
        }

        .footer a:hover {
            text-decoration: underline;
        }

        .divider {
            height: 1px;
            background: #e2e8f0;
            margin: 30px 0;
        }

        @media (max-width: 480px) {
            body {
                padding: 10px;
            }

            .header, .content, .footer {
                padding: 20px 15px;
            }

            .header-logo {
                max-width: 160px;
            }

            .header h1 {
                font-size: 24px;
            }

            .amount {
                font-size: 36px;
            }

            .button {
                padding: 14px 16px;
                font-size: 14px;
            }

            .invoice-summary {
                padding: 20px 15px;
            }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <img src="https://nexasync.ca/artlee/images/artlee_logo_transparent2.png" alt="ARTLEE Logo" class="header-logo">
            <h1>Invoice Statement</h1>
            <p>Billing Period:<br>{{date_range}}</p>
        </div>

        <div class="content">
            <div class="greeting">
                <strong>Dear {{to_name}},</strong>
                <br><br>
                Please find your ARTLEE invoice for the period indicated above. This statement details your usage and associated charges.
            </div>

            <div class="invoice-summary">
                <div class="invoice-id">INVOICE #{{invoice_id}}</div>

                <div class="amount-section">
                    <div class="amount-label">Total Amount Due</div>
                    <div class="amount">{{total_amount}}</div>
                </div>

                <div class="breakdown">
                    <div class="breakdown-item">
                        <div class="breakdown-left">
                            <span class="breakdown-label">Voice Call Services</span>
                            <span class="breakdown-subtext">{{total_calls}} calls</span>
                        </div>
                        <span class="breakdown-value">{{call_cost}}</span>
                    </div>
                    <div class="breakdown-item">
                        <div class="breakdown-left">
                            <span class="breakdown-label">SMS Messaging</span>
                            <span class="breakdown-subtext">{{total_chats}} messages</span>
                        </div>
                        <span class="breakdown-value">{{sms_cost}}</span>
                    </div>
                </div>
            </div>

            <div class="action-section">
                <a href="{{invoice_url}}" class="button btn-primary">Pay Invoice in Stripe</a>
                <a href="{{pdf_download_link}}" class="button btn-secondary">Download PDF Details</a>
            </div>

            <div class="info-box">
                <strong>Important:</strong> The PDF download link will expire in {{pdf_expiry_days}} days. Please save a copy for your records.
            </div>

            <div class="closing">
                Thank you for choosing Phaeton AI. If you have any questions regarding this invoice, please don't hesitate to contact our support team.
            </div>
        </div>

        <div class="footer">
            <div class="footer-brand"><a href="https://www.phaetonai.com">Phaeton AI</a></div>
            <p>Phone: <a href="tel:+18888957770">1 (888) 895-7770</a></p>
            <p>Email: <a href="mailto:contactus@phaetonai.com">contactus@phaetonai.com</a></p>
            <p style="margin-top: 15px; font-size: 12px; opacity: 0.7;">This is an automated notification. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>`

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const requestBody = await req.json()
    console.log('📥 Received request body:', JSON.stringify(requestBody, null, 2))

    const {
      to_email,
      to_name,
      invoice_id,
      date_range,
      total_amount,
      total_calls,
      call_cost,
      total_chats,
      sms_cost,
      invoice_url,
      pdf_download_link,
      pdf_expiry_days
    } = requestBody

    console.log('📧 Sending invoice email to:', to_email)

    // Validate required fields
    if (!to_email) {
      throw new Error('Missing required field: to_email')
    }
    if (!to_name) {
      throw new Error('Missing required field: to_name')
    }
    if (!invoice_id) {
      throw new Error('Missing required field: invoice_id')
    }

    // Replace template placeholders
    let emailHtml = HTML_TEMPLATE
      .replace(/{{to_name}}/g, to_name)
      .replace(/{{invoice_id}}/g, invoice_id)
      .replace(/{{date_range}}/g, date_range)
      .replace(/{{total_amount}}/g, total_amount)
      .replace(/{{total_calls}}/g, total_calls.toString())
      .replace(/{{call_cost}}/g, call_cost)
      .replace(/{{total_chats}}/g, total_chats.toString())
      .replace(/{{sms_cost}}/g, sms_cost)
      .replace(/{{invoice_url}}/g, invoice_url)
      .replace(/{{pdf_download_link}}/g, pdf_download_link)
      .replace(/{{pdf_expiry_days}}/g, pdf_expiry_days.toString())

    // Send email via Resend
    const data = await resend.emails.send({
      from: 'ARTLEE CRM <aibot@phaetonai.com>',
      to: [to_email],
      subject: `Invoice ${invoice_id} - ${total_amount}`,
      html: emailHtml,
    })

    console.log('✅ Email sent successfully:', data)

    return new Response(
      JSON.stringify({ success: true, data }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  } catch (error) {
    console.error('❌ Email error:', error)

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }
})
