import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly apiKey: string
  private readonly fromEmail: string

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY') || ''
    const rawFrom = this.configService.get<string>('RESEND_FROM_EMAIL') || 'onboarding@resend.dev'
    this.fromEmail = rawFrom.includes('<') ? rawFrom : `PrimeLiquidFX <${rawFrom}>`
  }

  /**
   * Generic send helper via Resend API HTTP POST.
   * Native fetch is used to avoid external dependencies.
   */
  private async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn(`[MailService] RESEND_API_KEY is not configured. Email will only be logged: To: ${to}, Subject: ${subject}`)
      return false
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [to],
          subject,
          html,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.error(`[MailService] Resend API failed: ${response.status} - ${errorText}`)
        return false
      }

      const result = await response.json()
      this.logger.log(`[MailService] Email sent successfully to ${to}. ID: ${(result as any).id}`)
      return true
    } catch (error: any) {
      this.logger.error(`[MailService] Failed to send email to ${to}: ${error.message}`, error.stack)
      return false
    }
  }

  /**
   * Helper to wrap raw content in a premium HTML frame with theme accents.
   */
  private wrapInTemplate(title: string, accentColor: string, bodyContent: string): string {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000'
    const logoUrl = `${frontendUrl}/logo_prime.png`
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .wrapper {
      width: 100%;
      background-color: #0b0f19;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .card {
      max-width: 580px;
      margin: 0 auto;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.2);
    }
    .header {
      padding: 30px;
      background: linear-gradient(135deg, #111827 0%, #1e1b4b 100%);
      border-bottom: 2px solid ${accentColor};
      text-align: center;
    }
    .logo-text {
      color: #ffffff;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .content {
      padding: 40px 30px;
      line-height: 1.6;
      font-size: 15px;
      color: #cbd5e1;
    }
    .footer {
      padding: 24px 30px;
      background: #0f172a;
      border-top: 1px solid #1f2937;
      font-size: 12px;
      color: #64748b;
      text-align: center;
      line-height: 1.5;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .text {
      margin-top: 0;
      margin-bottom: 24px;
    }
    .highlight-box {
      background: #1e293b;
      border: 1px dashed #334155;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-block;
      background-color: ${accentColor};
      color: #ffffff;
      font-weight: 600;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      margin-top: 10px;
      margin-bottom: 10px;
      text-align: center;
      transition: opacity 0.2s;
    }
    .btn:hover {
      opacity: 0.9;
    }
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-success {
      background-color: #065f46;
      color: #34d399;
    }
    .badge-warning {
      background-color: #78350f;
      color: #fbbf24;
    }
    .badge-danger {
      background-color: #7f1d1d;
      color: #f87171;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo" style="width: auto; height: auto; border: none; background: transparent; padding: 0; display: block; text-align: center; margin-bottom: 0;">
          <img src="${logoUrl}" alt="PrimeLiquidFX" style="display: block; margin: 0 auto; max-height: 40px; max-width: 180px; object-fit: contain;" />
        </div>
      </div>
      <div class="content">
        ${bodyContent}
      </div>
      <div class="footer">
        This is an automated notification from the PrimeLiquidFX system. If you did not request or recognize this activity, please contact support immediately.<br>
        &copy; ${new Date().getFullYear()} PrimeLiquidFX. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
`;
  }

  /**
   * 1. Send OTP email code during signup
   */
  async sendOtp(to: string, otp: string): Promise<boolean> {
    const accentColor = '#6366f1' // Indigo
    const body = `
      <h1 class="title">Verify your email address</h1>
      <p class="text">Thank you for starting your registration with PrimeLiquidFX. Please use the verification code below to confirm your email address. This code is valid for 5 minutes.</p>
      
      <div class="highlight-box" style="text-align: center; letter-spacing: 6px; font-size: 32px; font-weight: 800; color: #ffffff; font-family: monospace;">
        ${otp}
      </div>
      
      <p class="text" style="font-size: 13px; color: #64748b;">If you did not initiate this registration request, you can safely ignore this email.</p>
    `
    const html = this.wrapInTemplate('Email Verification OTP', accentColor, body)
    return this.send(to, 'Verify your email address', html)
  }

  /**
   * Send OTP email code for password reset
   */
  async sendForgotPasswordOtp(to: string, otp: string): Promise<boolean> {
    const accentColor = '#6366f1' // Indigo
    const body = `
      <h1 class="title">Reset your password</h1>
      <p class="text">We received a request to reset the password for your PrimeLiquidFX account. Please use the verification code below to proceed with resetting your password. This code is valid for 5 minutes.</p>
      
      <div class="highlight-box" style="text-align: center; letter-spacing: 6px; font-size: 32px; font-weight: 800; color: #ffffff; font-family: monospace;">
        ${otp}
      </div>
      
      <p class="text" style="font-size: 13px; color: #64748b;">If you did not request a password reset, you can safely ignore this email.</p>
    `
    const html = this.wrapInTemplate('Reset Password OTP', accentColor, body)
    return this.send(to, 'Password Reset Verification Code', html)
  }

  /**
   * 2. Send Welcome and Registration Submitted confirmation
   */
  async sendWelcomeEmail(to: string, companyName: string): Promise<boolean> {
    const accentColor = '#10b981' // Emerald
    const body = `
      <h1 class="title">Welcome to PrimeLiquidFX!</h1>
      <p class="text">Hello ${companyName},</p>
      <p class="text">We have successfully received your broker registration application. Our team is currently conducting business verification and reviewing your KYC documentation.</p>
      
      <div class="highlight-box">
        <div style="font-weight: 600; color: #ffffff; margin-bottom: 8px;">Application Summary:</div>
        <div style="font-size: 14px; color: #94a3b8; margin-bottom: 4px;">&bull; <strong>Company Name:</strong> ${companyName}</div>
        <div style="font-size: 14px; color: #94a3b8; margin-bottom: 4px;">&bull; <strong>Status:</strong> <span class="badge badge-warning">Pending Review</span></div>
        <div style="font-size: 14px; color: #94a3b8;">&bull; <strong>Email Verified:</strong> Yes</div>
      </div>
      
      <p class="text">Once verified and approved, you will receive another notification with your API access credentials, wallet instructions, and dashboard logins. Review typically takes 1-2 business days.</p>
    `
    const html = this.wrapInTemplate('Welcome to PrimeLiquidFX', accentColor, body)
    return this.send(to, 'Welcome! Registration submitted successfully', html)
  }

  /**
   * 3. Send Account Status updates (Approval / Suspension / Rejection)
   */
  async sendBrokerStatusEmail(to: string, companyName: string, status: 'APPROVED' | 'SUSPENDED' | 'REJECTED', note?: string): Promise<boolean> {
    let accentColor = '#6366f1' // Indigo default
    let statusLabel = 'Updated'
    let statusClass = 'badge-warning'
    let additionalInfo = ''

    if (status === 'APPROVED') {
      accentColor = '#10b981' // Emerald
      statusLabel = 'Approved'
      statusClass = 'badge-success'
      additionalInfo = `
        <p class="text">Congratulations! Your application has been approved. You now have access to:</p>
        <ul class="text" style="padding-left: 20px;">
          <li>API Credential Generation</li>
          <li>Wallet Management (USDT, BTC, ETH, USDC deposits)</li>
          <li>Broker Trading Credit Line</li>
          <li>Full Management Dashboard</li>
        </ul>
        <div style="text-align: center; margin-top: 30px; margin-bottom: 10px;">
          <a href="${this.configService.get('FRONTEND_URL') || 'http://localhost:3000'}/login" class="btn" style="color: #ffffff;">Log In to Dashboard</a>
        </div>
      `
    } else if (status === 'SUSPENDED') {
      accentColor = '#f59e0b' // Amber
      statusLabel = 'Suspended'
      statusClass = 'badge-warning'
      additionalInfo = `<p class="text">Please be advised that your trading credit line and dashboard API access have been suspended temporarily. Please contact support or reply to this email to resolve this issue.</p>`
    } else if (status === 'REJECTED') {
      accentColor = '#ef4444' // Rose
      statusLabel = 'Rejected'
      statusClass = 'badge-danger'
      additionalInfo = `<p class="text">We regret to inform you that your registration application was not accepted at this time based on our onboarding requirements.</p>`
    }

    const noteSection = note
      ? `<div class="highlight-box">
           <div style="font-weight: 600; color: #ffffff; margin-bottom: 6px;">Note:</div>
           <div style="font-size: 14px; color: #94a3b8; font-style: italic;">"${note}"</div>
         </div>`
      : ''

    const body = `
      <h1 class="title">Account Status Update</h1>
      <p class="text">Hello ${companyName},</p>
      <p class="text">The status of your broker account has been updated to:</p>
      
      <div style="margin-bottom: 24px;">
        <span class="badge ${statusClass}" style="font-size: 14px; padding: 6px 14px;">${statusLabel}</span>
      </div>
      
      ${noteSection}
      ${additionalInfo}
    `
    const html = this.wrapInTemplate(`Account Status: ${statusLabel}`, accentColor, body)
    return this.send(to, `Broker Account status updated: ${statusLabel}`, html)
  }

  /**
   * 4. Send Withdrawal request confirmation
   */
  async sendWithdrawalRequestEmail(to: string, amount: string, currency: string, txId: string): Promise<boolean> {
    const accentColor = '#f59e0b' // Amber
    const body = `
      <h1 class="title">Withdrawal Request Received</h1>
      <p class="text">We have received your withdrawal request. This transaction has been placed in pending review and will be processed shortly.</p>
      
      <div class="highlight-box">
        <div style="font-weight: 600; color: #ffffff; margin-bottom: 12px;">Transaction Details:</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="color: #64748b; padding: 6px 0;">Transaction Type:</td>
            <td style="color: #ffffff; text-align: right; font-weight: 600; padding: 6px 0;">Withdrawal (Debit)</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 6px 0;">Amount:</td>
            <td style="color: #ffffff; text-align: right; font-weight: 600; padding: 6px 0;">${amount} ${currency}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 6px 0;">Transaction ID:</td>
            <td style="color: #a5b4fc; text-align: right; font-family: monospace; font-size: 12px; padding: 6px 0;">${txId}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 6px 0;">Status:</td>
            <td style="text-align: right; padding: 6px 0;"><span class="badge badge-warning">Pending Review</span></td>
          </tr>
        </table>
      </div>
      
      <p class="text" style="font-size: 13px; color: #64748b;">Once approved, the funds will be transferred to your designated address, and you will receive a final confirmation email.</p>
    `
    const html = this.wrapInTemplate('Withdrawal Request Submitted', accentColor, body)
    return this.send(to, `Withdrawal request received - ${amount} ${currency}`, html)
  }

  /**
   * 5. Send transaction status notification (Approved / Rejected)
   */
  async sendTransactionStatusEmail(
    to: string,
    type: 'DEPOSIT' | 'WITHDRAWAL',
    amount: string,
    currency: string,
    status: 'APPROVED' | 'REJECTED',
    _note?: string,
  ): Promise<boolean> {
    const isApproved = status === 'APPROVED'
    const accentColor = isApproved ? '#10b981' : '#ef4444' // Emerald or Rose
    const typeLabel = type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'
    const statusLabel = isApproved ? 'Approved & Processed' : 'Rejected'
    const statusClass = isApproved ? 'badge-success' : 'badge-danger'

    const descriptionText = isApproved
      ? `Your ${typeLabel.toLowerCase()} of <strong>${amount} ${currency}</strong> has been approved and processed successfully.`
      : `Your ${typeLabel.toLowerCase()} request of <strong>${amount} ${currency}</strong> could not be processed.`

    const body = `
      <h1 class="title">${typeLabel} ${isApproved ? 'Approved' : 'Rejected'}</h1>
      <p class="text">${descriptionText}</p>
      
      <div class="highlight-box">
        <div style="font-weight: 600; color: #ffffff; margin-bottom: 12px;">Transaction Details:</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="color: #64748b; padding: 6px 0;">Type:</td>
            <td style="color: #ffffff; text-align: right; font-weight: 600; padding: 6px 0;">${type === 'DEPOSIT' ? 'Deposit (Credit)' : 'Withdrawal (Debit)'}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 6px 0;">Amount:</td>
            <td style="color: #ffffff; text-align: right; font-weight: 600; padding: 6px 0;">${amount} ${currency}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 6px 0;">Status:</td>
            <td style="text-align: right; padding: 6px 0;"><span class="badge ${statusClass}">${statusLabel}</span></td>
          </tr>
        </table>
      </div>
      
      <p class="text">Your wallet balances and trading credit lines have been updated automatically to reflect this status.</p>
    `
    const html = this.wrapInTemplate(`${typeLabel} ${statusLabel}`, accentColor, body)
    return this.send(to, `${typeLabel} ${statusLabel}: ${amount} ${currency}`, html)
  }

  /**
   * 6. Send Credit allocation notification
   */
  async sendCreditAllocationEmail(to: string, amount: string, reason: string, totalCredit: string): Promise<boolean> {
    const accentColor = '#6366f1' // Indigo
    const body = `
      <h1 class="title">Credit Line Allocation Update</h1>
      <p class="text">An adjustment has been made to your broker trading credit limit.</p>
      
      <div class="highlight-box">
        <div style="font-weight: 600; color: #ffffff; margin-bottom: 12px;">Credit Adjustment Details:</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="color: #64748b; padding: 6px 0;">Allocation Amount:</td>
            <td style="color: #34d399; text-align: right; font-weight: 600; padding: 6px 0;">+${amount} USD</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 6px 0;">New Total Credit Limit:</td>
            <td style="color: #ffffff; text-align: right; font-weight: 600; padding: 6px 0;">${totalCredit} USD</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 6px 0;">Reason:</td>
            <td style="color: #94a3b8; text-align: right; font-style: italic; padding: 6px 0;">"${reason}"</td>
          </tr>
        </table>
      </div>
      
      <p class="text">This update increases your available trading margin. You can view your real-time margin usage and trading exposure directly on your dashboard.</p>
    `
    const html = this.wrapInTemplate('Credit Line Updated', accentColor, body)
    return this.send(to, `Credit line allocation updated: +${amount} USD`, html)
  }
}
