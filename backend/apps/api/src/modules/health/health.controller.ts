import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { PrismaService } from '../../database/prisma.service'
import { RedisService } from '../../redis/redis.service'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'System health check' })
  async check() {
    let dbStatus = 'ok'
    let redisStatus = 'ok'

    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      dbStatus = 'error'
    }

    try {
      await this.redis.get('ping')
    } catch {
      redisStatus = 'error'
    }

    const isHealthy = dbStatus === 'ok' && redisStatus === 'ok'

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        cache: redisStatus,
      },
    }
  }
}
