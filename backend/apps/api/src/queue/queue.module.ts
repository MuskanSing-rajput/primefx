import { Module, Global } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Global()
@Module({
  providers: [
    {
      provide: 'BULLMQ_REDIS_OPTION',
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('REDIS_URL', 'redis://localhost:6379')
        return { connection: { url } }
      },
      inject: [ConfigService],
    },
  ],
  exports: ['BULLMQ_REDIS_OPTION'],
})
export class QueueModule {}
