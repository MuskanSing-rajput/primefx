import { Module } from '@nestjs/common'
import { AdminService } from './admin.service'
import { AdminController } from './admin.controller'
import { NotificationModule } from '../notification/notification.module'
import { RedisModule } from '../../redis/redis.module'
import { TradingModule } from '../trading/trading.module'

@Module({
  imports: [NotificationModule, RedisModule, TradingModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
