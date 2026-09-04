import { Module } from '@nestjs/common'
import { WalletService } from './wallet.service'
import { WalletController } from './wallet.controller'
import { BlockchainService } from './blockchain.service'

@Module({
  controllers: [WalletController],
  providers: [WalletService, BlockchainService],
  exports: [WalletService, BlockchainService],
})
export class WalletModule {}

