import { Module, Global } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisService } from './redis.service'

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (configService: ConfigService) => {
        const { default: Redis } = await import('ioredis')
        const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379')
        const client = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: false,
          enableReadyCheck: true,
        })
        return client
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
