import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Prisma } from '@prisma/client'
import { TradingService } from './trading.service'

describe('TradingService', () => {
  const prisma: any = {
    broker: {
      findUnique: jest.fn(),
    },
    tradingClient: {
      findFirst: jest.fn(),
    },
    tradingSymbol: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    pricingProfile: {
      findFirst: jest.fn(),
    },
    position: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    order: {
      create: jest.fn(),
      update: jest.fn(),
    },
    wallet: {
      updateMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  }

  const redis: any = {
    getPrice: jest.fn(),
  }

  let service: TradingService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new TradingService(prisma, redis)
  })

  it('closes a position using the stored margin snapshot', async () => {
    prisma.position.findFirst.mockResolvedValue({
      id: 'pos-1',
      brokerId: 'broker-1',
      side: 'BUY',
      openPrice: '1.00000',
      volume: '2.00',
      commission: '1.00',
      orderId: 'ord-1',
      marginReservedUSD: '123.45000000',
      leverageAtOpen: 50,
      symbol: { name: 'EURUSD', contractSize: '100000.00', digits: 5 },
      client: { leverage: 25 },
    })
    redis.getPrice.mockResolvedValue({ bid: '1.10000', ask: '1.10020', ts: String(Date.now()) })

    const closeResult = { count: 1 }
    const tx = {
      position: {
        updateMany: (jest.fn() as any).mockResolvedValue(closeResult),
        findUnique: (jest.fn() as any).mockResolvedValue({ id: 'pos-1', status: 'CLOSED', closedAt: new Date() }),
      },
      order: {
        update: jest.fn(),
      },
      wallet: {
        findUnique: (jest.fn() as any).mockResolvedValue({ id: 'wallet-1', brokerId: 'broker-1' }),
        update: jest.fn(),
      },
    }

    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const result = await service.closePosition('pos-1', 'broker-1')

    expect(result.status).toBe('CLOSED')
    expect(tx.wallet.update).toHaveBeenCalledTimes(1)

    const walletUpdate = tx.wallet.update.mock.calls[0][0] as any
    expect(walletUpdate.where.id).toBe('wallet-1')
    expect(walletUpdate.data.usedCreditUSD.decrement.toString()).toBe('123.45')
    expect(walletUpdate.data.availableCreditUSD.increment.toString()).toBe('123.45')
  })

  it('rejects duplicate close attempts without releasing margin twice', async () => {
    prisma.position.findFirst.mockResolvedValue({
      id: 'pos-1',
      brokerId: 'broker-1',
      side: 'BUY',
      openPrice: '1.00000',
      volume: '2.00',
      commission: '1.00',
      orderId: 'ord-1',
      marginReservedUSD: '123.45000000',
      leverageAtOpen: 50,
      symbol: { name: 'EURUSD', contractSize: '100000.00', digits: 5 },
      client: { leverage: 25 },
    })
    redis.getPrice.mockResolvedValue({ bid: '1.10000', ask: '1.10020', ts: String(Date.now()) })

    const tx = {
      position: {
        updateMany: (jest.fn() as any).mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      order: {
        update: jest.fn(),
      },
      wallet: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    }

    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx))

    await expect(service.closePosition('pos-1', 'broker-1')).rejects.toThrow(
      'Position is no longer open or has already been closed',
    )

    expect(tx.wallet.update).not.toHaveBeenCalled()
  })

  it('places an A-Book trade directly with symbol name without requiring clientId', async () => {
    prisma.broker.findUnique.mockResolvedValue({
      id: 'broker-1',
      companyName: 'Prabhat Broker',
      email: 'prabhat@broker.com',
      tradingMode: 'DEMO',
      demoExecutionAccountId: 'demo-exec-1',
      demoExecutionAccount: { id: 'demo-exec-1', provider: 'MOCK' },
      wallet: {
        id: 'wallet-1',
        balanceUSDT: '10000.00',
        balanceUSDC: '0.00',
        balanceBTC: '0.00',
        balanceETH: '0.00',
        totalCreditUSD: '50000.00',
        usedCreditUSD: '0.00',
        availableCreditUSD: '50000.00',
      },
    })

    prisma.tradingClient.findFirst.mockResolvedValue({
      id: 'house-client-1',
      brokerId: 'broker-1',
      externalClientId: 'ABOOK_MASTER',
      firstName: 'Prabhat Broker',
      lastName: 'Master Account',
      leverage: 100,
      isActive: true,
    })

    prisma.tradingSymbol.findFirst.mockResolvedValue({
      id: 'sym-gold',
      name: 'XAUUSD',
      digits: 2,
      contractSize: 100,
      rawSpread: 0.20,
      isActive: true,
    })

    redis.getPrice.mockResolvedValue({
      bid: '2650.00',
      ask: '2650.50',
      ts: String(Date.now()),
    })

    prisma.brokerSpreadConfig = {
      findUnique: (jest.fn() as any).mockResolvedValue({
        commissionPerLot: '5.00',
        globalMarkupPips: '0',
        symbolOverrides: [],
      }),
    }
    redis.getBrokerRawPrice = (jest.fn() as any).mockResolvedValue(null)
    prisma.pricingProfile.findFirst.mockResolvedValue(null)

    const tx = {
      position: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
        create: (jest.fn() as any).mockImplementation((args: any) =>
          Promise.resolve({ id: 'pos-gold-1', ...args.data, status: 'OPEN' }),
        ),
      },
      order: {
        create: (jest.fn() as any).mockImplementation((args: any) =>
          Promise.resolve({ id: 'ord-gold-1', ...args.data, status: 'FILLED' }),
        ),
      },
      wallet: {
        update: jest.fn(),
      },
    }

    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx))

    const result = await service.placeOrder('broker-1', {
      symbol: 'XAUUSD',
      side: 'BUY',
      type: 'MARKET',
      volume: '0.50',
      externalId: 'PT-10423',
    })

    expect(result.order).toBeDefined()
    expect(result.order.status).toBe('FILLED')
    expect(result.order.filledVolume).toBe('0.50')
    expect(result.position).toBeDefined()
    expect(result.position.openPrice).toBe('2650.50')
    expect(tx.order.create).toHaveBeenCalled()
    const createdOrder = (tx.order.create as any).mock.calls[0][0].data
    expect(createdOrder.symbolId).toBe('sym-gold')
    expect(createdOrder.clientId).toBe('house-client-1')
    expect(createdOrder.externalId).toBe('PT-10423')
  })
})