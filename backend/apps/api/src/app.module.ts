import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { configSchema } from './config/config.schema'
import { DatabaseModule } from './database/database.module'
import { RedisModule } from './redis/redis.module'
import { QueueModule } from './queue/queue.module'
import { AuthModule } from './modules/auth/auth.module'
import { BrokerModule } from './modules/broker/broker.module'
import { WalletModule } from './modules/wallet/wallet.module'
import { SymbolModule } from './modules/symbol/symbol.module'
import { PricingModule } from './modules/pricing/pricing.module'
import { ClientModule } from './modules/client/client.module'
import { TradingModule } from './modules/trading/trading.module'
import { ExecutionModule } from './modules/execution/execution.module'
import { NotificationModule } from './modules/notification/notification.module'
import { ReportingModule } from './modules/reporting/reporting.module'
import { AdminModule } from './modules/admin/admin.module'
import { HealthModule } from './modules/health/health.module'
import { InquiryModule } from './modules/inquiry/inquiry.module'
import { SupportModule } from './modules/support/support.module'
import { MailModule } from './modules/mail/mail.module'
import { RATE_LIMITS } from '@lp/constants'

@Module({
  imports: [
    // ─── Config ──────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      validate: configSchema.parse,
      envFilePath: ['.env.local', '.env'],
    }),

    // ─── Rate Limiting ────────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: RATE_LIMITS.GENERAL_WINDOW_MS,
        limit: RATE_LIMITS.GENERAL_REQUESTS,
      },
    ]),

    // ─── Scheduling ───────────────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ─── Infrastructure ───────────────────────────────────────────────────────
    DatabaseModule,
    RedisModule,
    QueueModule,

    // ─── Feature Modules ──────────────────────────────────────────────────────
    AuthModule,
    BrokerModule,
    WalletModule,
    SymbolModule,
    PricingModule,
    ClientModule,
    TradingModule,
    ExecutionModule,
    NotificationModule,
    ReportingModule,
    AdminModule,
    HealthModule,
    InquiryModule,
    SupportModule,
    MailModule,
  ],
  providers: [
    // Apply throttle globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
