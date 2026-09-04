import { Module } from '@nestjs/common'
import { ExecutionService } from './execution.service'
import { ExecutionController } from './execution.controller'
import { ExecutionKeepAliveService } from './execution-keepalive.service'

@Module({
  controllers: [ExecutionController],
  providers: [ExecutionService, ExecutionKeepAliveService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
