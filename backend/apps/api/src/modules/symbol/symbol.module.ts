import { Module } from '@nestjs/common'
import { SymbolService } from './symbol.service'
import { SymbolController } from './symbol.controller'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [NotificationModule],
  controllers: [SymbolController],
  providers: [SymbolService],
  exports: [SymbolService],
})
export class SymbolModule {}
