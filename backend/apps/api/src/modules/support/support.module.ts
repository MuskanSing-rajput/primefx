import { Module } from '@nestjs/common'
import { SupportService } from './support.service'
import { BrokerSupportController } from './broker-support.controller'
import { AdminSupportController } from './admin-support.controller'
import { DatabaseModule } from '../../database/database.module'

@Module({
  imports: [DatabaseModule],
  controllers: [BrokerSupportController, AdminSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
