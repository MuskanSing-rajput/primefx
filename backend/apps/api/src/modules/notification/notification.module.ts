import { Module } from '@nestjs/common'
import { NotificationGateway } from './notification.gateway'
import { PriceFeedService } from './price-feed.service'
import { RedisModule } from '../../redis/redis.module'
import { TradingModule } from '../trading/trading.module'

@Module({
  imports: [RedisModule, TradingModule],
  providers: [NotificationGateway, PriceFeedService],
  exports: [NotificationGateway, PriceFeedService],
})
export class NotificationModule {}
