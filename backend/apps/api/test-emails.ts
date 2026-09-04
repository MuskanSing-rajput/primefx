import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { MailService } from './src/modules/mail/mail.service';

async function bootstrap() {
  const email = process.argv[2];
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    console.error('❌ Error: Please provide a valid email address as a command line argument.');
    console.error('Usage: npx ts-node test-emails.ts <email>');
    process.exit(1);
  }

  console.log('🚀 Booting NestJS Application context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const mailService = app.get(MailService);

  console.log(`\n📬 Dispatched mail test sequence to: ${email}\n`);

  try {
    // 1. Signup OTP
    console.log('➡️ Sending [Signup OTP] email...');
    await mailService.sendOtp(email, '482019');

    // 2. Forgot Password OTP
    console.log('➡️ Sending [Forgot Password OTP] email...');
    await mailService.sendForgotPasswordOtp(email, '902811');

    // 3. Welcome / Registration Mail
    console.log('➡️ Sending [Welcome & Under Review] email...');
    await mailService.sendWelcomeEmail(email, 'Acme Global Markets');

    // 4. Broker Account Approved
    console.log('➡️ Sending [Broker Account Approved] email...');
    await mailService.sendBrokerStatusEmail(email, 'Acme Global Markets', 'APPROVED', 'Compliance check completed successfully. Welcome to the platform.');

    // 5. Broker Account Suspended
    console.log('➡️ Sending [Broker Account Suspended] email...');
    await mailService.sendBrokerStatusEmail(email, 'Acme Global Markets', 'SUSPENDED', 'Pending regulatory documentation update. Please contact compliance.');

    // 6. Withdrawal Request Initiated
    console.log('➡️ Sending [Withdrawal Request Initiated] email...');
    await mailService.sendWithdrawalRequestEmail(email, '15000', 'USD', 'TX-WD-90812');

    // 7. Transaction Approved (Deposit)
    console.log('➡️ Sending [Deposit Approved] email...');
    await mailService.sendTransactionStatusEmail(email, 'DEPOSIT', '25000', 'USD', 'APPROVED');

    // 8. Transaction Rejected (Withdrawal)
    console.log('➡️ Sending [Withdrawal Rejected] email...');
    await mailService.sendTransactionStatusEmail(email, 'WITHDRAWAL', '8000', 'EUR', 'REJECTED', 'Insufficient free margin to execute the request.');

    // 9. Credit Allocation Changed
    console.log('➡️ Sending [Credit Limit Allocated] email...');
    await mailService.sendCreditAllocationEmail(email, '100000', 'Strategic margin tier adjustment', '500000');

    console.log('\n✅ All test emails successfully generated and sent to Resend API!');
  } catch (err: any) {
    console.error(`❌ Mail dispatch failed: ${err.message}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch(console.error);
