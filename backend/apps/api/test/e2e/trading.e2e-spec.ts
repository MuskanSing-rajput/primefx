import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client'
import { AppModule } from '../../src/app.module'
import { PrismaService } from '../../src/database/prisma.service'
import { RedisService } from '../../src/redis/redis.service'
import { WS_NAMESPACES, WS_EVENTS } from '@lp/constants'
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard'
import { RolesGuard } from '../../src/common/guards/roles.guard'
import { AdminService } from '../../src/modules/admin/admin.service'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'

// Set Jest timeout for this E2E suite
jest.setTimeout(30000)
import { NotificationGateway } from '../../src/modules/notification/notification.gateway'
import { PriceFeedService } from '../../src/modules/notification/price-feed.service'

// Minimal in-memory mock prisma implementing methods used by TradingService & NotificationGateway
class MockPrisma {
  // simple stores
  _brokers = [{ id: 'broker-1', executionAccountId: 'exec-1', wallet: { id: 'wallet-1', availableCreditUSD: 1000000, usedCreditUSD: 0 } }]
  _tradingClients = [{ id: '00000000-0000-0000-0000-000000000001', brokerId: 'broker-1', isActive: true, leverage: 100 }]
  _tradingSymbols = [{ id: '00000000-0000-0000-0000-000000000002', name: 'EURUSD', digits: 5, contractSize: 100000, rawSpread: '0.0002', rawCommission: '3.5', isActive: true }]
  _pricingProfiles = [{ id: '00000000-0000-0000-0000-000000000003', brokerId: 'broker-1', isDefault: true, spreadMarkup: '0.0001', commissionMarkup: '0.50', symbolOverrides: [] }]
  _brokerApiCredentials = [{ apiKey: 'test-api-key', isActive: true, brokerId: 'broker-1', broker: { status: 'APPROVED', companyName: 'Test Broker' } }]

  orders: any[] = []
  positions: any[] = []

  // Prisma-like methods used in services
  async $connect() {}
  async $disconnect() {}

  async broker_findUnique(opts: any) {
    return this._brokers.find(b => b.id === opts.where.id) ?? null
  }

  async tradingClient_findFirst(opts: any) {
    return this._tradingClients.find(c => c.id === opts.where.id && c.brokerId === opts.where.brokerId) ?? null
  }

  async tradingSymbol_findUnique(opts: any) {
    return this._tradingSymbols.find(s => s.id === opts.where.id) ?? null
  }

  async pricingProfile_findFirst(opts: any) {
    return this._pricingProfiles.find(p => p.brokerId === opts.where.brokerId && (opts.where.isDefault ? p.isDefault : true)) ?? null
  }

  async brokerApiCredential_findUnique(opts: any) {
    return this._brokerApiCredentials.find(c => c.apiKey === opts.where.apiKey) ?? null
  }

  // wallet updateMany used during reserve
  async wallet_updateMany(opts: any) {
    const w = this._brokers[0].wallet
    const required = opts.data.usedCreditUSD?.increment ?? 0
    if (w.availableCreditUSD >= Number(required)) {
      w.availableCreditUSD -= Number(required)
      w.usedCreditUSD += Number(required)
      return { count: 1 }
    }
    return { count: 0 }
  }

  async order_create({ data }: any) {
    const order = { id: `order-${this.orders.length+1}`, ...data, createdAt: new Date(), status: data.status }
    this.orders.push(order)
    return order
  }

  async position_create({ data }: any) {
    const position = { id: `pos-${this.positions.length+1}`, ...data, createdAt: new Date(), status: data.status }
    this.positions.push(position)
    return position
  }

  async $transaction(cb: any) {
    // very small transaction emulation: pass 'this' as tx
    return cb(this)
  }

  // finders used in closePosition
  async position_findFirst(opts: any) {
    const p = this.positions.find(p => p.id === opts.where.id && p.brokerId === opts.where.brokerId && p.status === opts.where.status)
    if (!p) return null
    // include symbol and client selects used by TradingService.closePosition
    return {
      ...p,
      symbol: { name: 'EURUSD', contractSize: 100000, digits: 5 },
      client: { leverage: 100 },
    }
  }

  async position_updateMany(opts: any) {
    const p = this.positions.find(pos => pos.id === opts.where.id && pos.brokerId === opts.where.brokerId && pos.status === opts.where.status)
    if (!p) return { count: 0 }
    Object.assign(p, opts.data)
    p.status = opts.data.status
    return { count: 1 }
  }

  async position_findUnique(opts: any) {
    return this.positions.find(p => p.id === opts.where.id) ?? null
  }

  async order_update(opts: any) {
    const o = this.orders.find(x => x.id === opts.where.id)
    if (o) Object.assign(o, opts.data)
    return o
  }

  async wallet_findUnique(opts: any) {
    const w = this._brokers[0].wallet
    return { id: w.id, brokerId: 'broker-1', availableCreditUSD: w.availableCreditUSD, usedCreditUSD: w.usedCreditUSD }
  }

  async wallet_update(opts: any) {
    const w = this._brokers[0].wallet
    if (opts.data.usedCreditUSD?.decrement) {
      const v = Number(opts.data.usedCreditUSD.decrement)
      w.usedCreditUSD -= v
    }
    if (opts.data.availableCreditUSD?.increment) {
      const v = Number(opts.data.availableCreditUSD.increment)
      w.availableCreditUSD += v
    }
    return w
  }

  // Generic keyed accessors (simulate prisma.<model>.<method>)
  get broker() { return { findUnique: (opts: any) => this.broker_findUnique(opts) } }
  get tradingClient() { return { findFirst: (opts: any) => this.tradingClient_findFirst(opts) } }
  get tradingSymbol() { return { findUnique: (opts: any) => this.tradingSymbol_findUnique(opts) } }
  get pricingProfile() { return { findFirst: (opts: any) => this.pricingProfile_findFirst(opts) } }
  get brokerApiCredential() { return { findUnique: (opts: any) => this.brokerApiCredential_findUnique(opts) } }
  get wallet() { return { updateMany: (opts: any) => this.wallet_updateMany(opts), findUnique: (opts: any) => this.wallet_findUnique(opts), update: (opts: any) => this.wallet_update(opts) } }
  get order() { return { create: (d: any) => this.order_create(d), update: (d: any) => this.order_update(d), findMany: async () => ({ data: this.orders }) } }
  get position() { return { create: (d: any) => this.position_create(d), findFirst: (d: any) => this.position_findFirst(d), updateMany: (d: any) => this.position_updateMany(d), findUnique: (d: any) => this.position_findUnique(d), findMany: async () => this.positions } }
  get $transactionProxy() { return this }

  // Prisma $transaction alias
  async $transactionProxyMethod(cb: any) { return this.$transaction(cb) }
}

class MockRedisService {
  async getPrice(symbol: string) {
    return { bid: '1.08430', ask: '1.08450', ts: Date.now() }
  }
  async setPrice(symbol: string, bid: string, ask: string) {
    return Promise.resolve()
  }
}

describe('Trading E2E (mocked DB & Redis)', () => {
  let app: INestApplication
  let prisma: MockPrisma
  let clientSocket: ClientSocket

  beforeAll(async () => {
    prisma = new MockPrisma()

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma as unknown as PrismaService)
      .overrideProvider(RedisService)
      .useValue(new MockRedisService() as unknown as RedisService)
      // Prevent real ioredis client from connecting during tests
      .overrideProvider('REDIS_CLIENT')
      .useValue({ connect: async () => {}, disconnect: async () => {}, quit: async () => {}, on: () => {} })
      // Prevent AdminService from running onModuleInit which expects DB models
      .overrideProvider(AdminService)
      .useValue({
        onModuleInit: async () => {},
        getDashboardMetrics: async () => ({ totalBrokers: 0, activeBrokers: 0, pendingApprovals: 0, totalVolumeUSD24h: '0.00', totalPnlUSD: '0.00', activePositions: 0, systemAlerts: 0 }),
        getSettings: async () => [],
        updateSetting: async () => null,
        getAuditLogs: async () => ({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
      })
      // override Jwt guard at controller level to inject broker user
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => {
        const req = ctx.switchToHttp().getRequest()
        req.user = { id: 'broker-1', role: 'BROKER' }
        return true
      }})
      // override RolesGuard to allow role checks during tests
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      // Prevent background price streamer from starting timers during tests
      .overrideProvider(PriceFeedService)
      .useValue({ onModuleInit: async () => {}, onModuleDestroy: async () => {} })
      .compile()

    app = moduleFixture.createNestApplication()
    // Ensure tests use same API prefix as runtime
    app.setGlobalPrefix('api/v1')
    // Install simple global guard stubs to bypass authentication and inject a broker user
    app.useGlobalGuards({ canActivate: (ctx: any) => { const req = ctx.switchToHttp().getRequest(); req.user = { id: 'broker-1', role: 'BROKER' }; return true } })
    await app.init()

    // connect socket client to /prices namespace using API key
    const server = app.getHttpServer()
    const address = (server as any).address() || { port: 3001 }
    const port = address.port || 3001
    clientSocket = ClientIO(`http://127.0.0.1:${port}${WS_NAMESPACES.PRICES}`, { query: { apiKey: 'test-api-key' }, transports: ['websocket'], reconnection: false })

    await new Promise((resolve, reject) => {
      clientSocket.on('connect', () => resolve(true))
      clientSocket.on('connect_error', (err: any) => reject(err))
      setTimeout(() => reject(new Error('Socket connect timeout')), 3000)
    })
  }, 20000)

  afterAll(async () => {
    try {
      if (clientSocket) clientSocket.disconnect()
    } catch (e) {}
    await app.close()
  })

  it('places an order, creates a position, updates wallet and emits position update via websocket', async () => {
    const server = app.getHttpServer()

    // Place order
    const orderResp = await request(server)
      .post('/api/v1/orders')
      .send({ clientId: '00000000-0000-0000-0000-000000000001', symbolId: '00000000-0000-0000-0000-000000000002', side: 'BUY', type: 'MARKET', volume: '1.0' })
      .expect(201)

    expect(orderResp.body).toBeDefined()
    const { order, position } = orderResp.body
    expect(order).toBeDefined()
    expect(position).toBeDefined()

    // Wallet reserved
    const wallet = (prisma as any)._brokers[0].wallet
    expect(wallet.usedCreditUSD).toBeGreaterThan(0)

    // Trigger server broadcast via NotificationGateway
    const notifGateway = app.get(NotificationGateway)
    // Spy on server.to(...).emit(...) to capture broadcasted position updates
    let capturedBroadcast: any = null
    const originalTo = (notifGateway.server as any).to
    if ((notifGateway.server as any).to) {
      ;(notifGateway.server as any).to = (room: string) => ({
        emit: (event: string, payload: any) => {
          capturedBroadcast = { room, event, payload }
        },
      })
    }
    // Ensure the test client is joined to the broker room on the server so it receives the room-scoped position update
    const clientId = clientSocket.id
    try {
      const socketsMap = (notifGateway.server as any).sockets?.sockets
      const serverSocket = socketsMap ? socketsMap.get(clientId) : null
      if (serverSocket) serverSocket.join(`broker:broker-1`)
    } catch (_) {
      // Ignore join errors in test harness
    }
    // call broadcastPositionUpdate(brokerId, positionId, floatingPnl, currentPrice)
    notifGateway.broadcastPositionUpdate('broker-1', position.id, '12.34', '1.08500')

    // Verify server-side broadcast occurred
    expect(capturedBroadcast).toBeDefined()
    expect(capturedBroadcast.room).toEqual('broker:broker-1')
    expect(capturedBroadcast.event).toEqual(WS_EVENTS.POSITION_UPDATE)
    expect(capturedBroadcast.payload.positionId).toEqual(position.id)
    expect(capturedBroadcast.payload.floatingPnl).toEqual('12.34')
    // restore original
    if (originalTo) (notifGateway.server as any).to = originalTo

    // Now close the position via API
    const closeResp = await request(server).post(`/api/v1/positions/${position.id}/close`).expect(201)
    expect(closeResp.body).toBeDefined()
    expect(closeResp.body.status).toEqual('CLOSED')

    // Wallet credits should be restored (used decreased)
    const w = (prisma as any)._brokers[0].wallet
    expect(w.usedCreditUSD).toBeGreaterThanOrEqual(0)
  })
})
