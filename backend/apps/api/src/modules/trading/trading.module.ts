import { Module } from '@nestjs/common'
import { TradingService } from './trading.service'
import { TradingController } from './trading.controller'

@Module({
  controllers: [TradingController],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
