import { Module } from '@nestjs/common'
import { BrokerService } from './broker.service'
import { BrokerController } from './broker.controller'
import { BrokerExternalApiController } from './broker-external-api.controller'
import { TradingModule } from '../trading/trading.module'
import { ClientModule } from '../client/client.module'
import { SymbolModule } from '../symbol/symbol.module'
import { PricingModule } from '../pricing/pricing.module'
import { ReportingModule } from '../reporting/reporting.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [TradingModule, ClientModule, SymbolModule, PricingModule, ReportingModule, AuthModule],
  controllers: [BrokerController, BrokerExternalApiController],
  providers: [BrokerService],
  exports: [BrokerService],
})
export class BrokerModule {}

