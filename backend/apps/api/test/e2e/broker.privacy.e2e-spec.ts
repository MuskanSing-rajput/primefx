import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../../src/app.module'
import { PrismaService } from '../../src/database/prisma.service'
import { RedisService } from '../../src/redis/redis.service'
import { AdminService } from '../../src/modules/admin/admin.service'
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard'
import { RolesGuard } from '../../src/common/guards/roles.guard'
import { PriceFeedService } from '../../src/modules/notification/price-feed.service'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'

// Minimal mock prisma that respects `select`/`include` for broker.findUnique
class MockPrisma {
  _brokers = [{ id: 'broker-1', companyName: 'Test Broker', executionAccountId: 'exec-1', wallet: { id: 'wallet-1', availableCreditUSD: 10000, usedCreditUSD: 0 } }]

  async $connect() {}
  async $disconnect() {}

  async broker_findUnique(opts: any) {
    const b = this._brokers.find(x => x.id === opts.where.id) ?? null
    if (!b) return null
    // If select provided, return only selected fields
    if (opts.select) {
      const out: any = {}
      for (const k of Object.keys(opts.select)) {
        const v = (opts.select as any)[k]
        if (v === true) out[k] = (b as any)[k]
        else if (typeof v === 'object') {
          // nested selects for relations like wallet or apiCredentials
          if (k === 'wallet') out.wallet = b.wallet
          else if (k === 'executionAccount') out.executionAccount = { id: 'exec-1', accountName: 'ExecAccount', provider: 'LP' }
        }
      }
      return out
    }
    return b
  }

  get broker() { return { findUnique: (opts: any) => this.broker_findUnique(opts) } }
}

class MockRedisService { async getPrice() { return null } }

describe('Broker privacy - controller (E2E)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(new MockPrisma() as unknown as PrismaService)
      .overrideProvider(RedisService)
      .useValue(new MockRedisService() as unknown as RedisService)
      // Prevent real ioredis client from connecting during tests
      .overrideProvider('REDIS_CLIENT')
      .useValue({ connect: async () => {}, disconnect: async () => {}, quit: async () => {}, on: () => {} })
      .overrideProvider(AdminService)
      .useValue({ onModuleInit: async () => {}, getDashboardMetrics: async () => ({}) })
      // Override Jwt guard with a simple stub to inject broker user at controller level
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => {
        const req = ctx.switchToHttp().getRequest()
        req.user = { id: 'broker-1', role: 'BROKER' }
        return true
      }})
      // stub RolesGuard to avoid permission checks interfering with this privacy test
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      // Prevent background price streamer from starting timers during tests
      .overrideProvider(PriceFeedService)
      .useValue({ onModuleInit: async () => {}, onModuleDestroy: async () => {} })
      .compile()

    app = moduleFixture.createNestApplication()
    // Use same API prefix as the running app
    app.setGlobalPrefix('api/v1')
    app.useGlobalGuards({ canActivate: (ctx: any) => { const req = ctx.switchToHttp().getRequest(); req.user = { id: 'broker-1', role: 'BROKER' }; return true } })
    await app.init()
  }, 20000)

  afterAll(async () => {
    await app.close()
  })

  it('does not expose execution account details to broker on /api/v1/brokers/me', async () => {
    const server = app.getHttpServer()
    const res = await request(server).get('/api/v1/brokers/broker-1').expect(200)
    expect(res.body).toBeDefined()
    // Ensure internal scalar executionAccountId and relation executionAccount are not present
    const body = res.body
    expect(body.executionAccountId).toBeUndefined()
    expect(body.executionAccount).toBeUndefined()
  })
})
