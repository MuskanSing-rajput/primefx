import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Prisma } from '@prisma/client'
import { WalletService } from './wallet.service'

describe('WalletService', () => {
  const prisma: any = {
    wallet: {
      findUnique: jest.fn(),
    },
    broker: {
      findUnique: jest.fn(),
    },
    systemSetting: {
      findUnique: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    position: {
      findMany: jest.fn(),
    },
    creditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  }

  const blockchain: any = {
    verifyTransaction: jest.fn(),
  }

  const mailService: any = {
    sendDepositNotification: (jest.fn() as any).mockResolvedValue(true),
    sendWithdrawalNotification: (jest.fn() as any).mockResolvedValue(true),
    sendWithdrawalRequestEmail: (jest.fn() as any).mockResolvedValue(true),
  }

  let service: WalletService

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.position.findMany.mockResolvedValue([])
    prisma.walletTransaction.findMany.mockResolvedValue([])
    service = new WalletService(prisma, blockchain, mailService)
  })

  it('creates a PENDING withdrawal transaction when available credit is sufficient', async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: 'wallet-1',
      brokerId: 'broker-1',
      availableCreditUSD: '1000.00',
      totalCreditUSD: '1000.00',
      balanceUSDT: '250.00',
      balanceBTC: '0.00',
      balanceETH: '0.00',
      balanceUSDC: '0.00',
      usedCreditUSD: '0.00',
      isActive: true,
    })
    prisma.systemSetting.findUnique.mockResolvedValue(null)
    prisma.broker.findUnique.mockResolvedValue({ id: 'broker-1', mfaEnabled: false, mfaSecret: null })
    prisma.walletTransaction.create.mockResolvedValue({
      id: 'txn-1',
      walletId: 'wallet-1',
      type: 'WITHDRAWAL',
      status: 'PENDING',
      amount: '125.00',
    })

    const res = await service.createWithdrawal('broker-1', {
      currency: 'USDT',
      amount: '125.00',
      destinationAddress: '0xabc1234567890',
      totpCode: '123456',
    })

    expect(prisma.walletTransaction.create).toHaveBeenCalledTimes(1)
    expect(res.id).toBe('txn-1')
  })

  it('rejects withdrawal when available credit is insufficient', async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: 'wallet-1',
      brokerId: 'broker-1',
      availableCreditUSD: '50.00',
      totalCreditUSD: '50.00',
      balanceUSDT: '50.00',
      balanceBTC: '0.00',
      balanceETH: '0.00',
      balanceUSDC: '0.00',
      usedCreditUSD: '0.00',
      isActive: true,
    })
    prisma.systemSetting.findUnique.mockResolvedValue(null)
    prisma.broker.findUnique.mockResolvedValue({ id: 'broker-1', mfaEnabled: false, mfaSecret: null })

    await expect(
      service.createWithdrawal('broker-1', {
        currency: 'USDT',
        amount: '125.00',
        destinationAddress: '0xabc1234567890',
        totpCode: '123456',
      }),
    ).rejects.toThrow('Insufficient available credit')
  })
})