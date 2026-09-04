import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { BrokerService } from './broker.service'

describe('BrokerService.findOne privacy', () => {
  const prisma: any = {
    broker: {
      findUnique: jest.fn(),
    },
  }

  let service: BrokerService

  const mailService: any = {
    sendBrokerStatusEmail: (jest.fn() as any).mockResolvedValue(true),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // emulate prisma.findUnique respecting select flag
    prisma.broker.findUnique.mockImplementation(({ where, select }: any) => {
      const base = { id: 'broker-1', companyName: 'Test Broker', wallet: { id: 'w1' } }
      if (select && select.executionAccount) {
        return Promise.resolve({ ...base, executionAccount: { id: 'exec-1', accountName: 'Internal', provider: 'LPX' } })
      }
      return Promise.resolve(base)
    })

    service = new BrokerService(prisma, mailService)
  })

  it('does not include executionAccount when includeExecutionAccount=false', async () => {
    prisma.broker.findUnique.mockResolvedValue({
      id: 'broker-1',
      companyName: 'Test Broker',
      executionAccount: { id: 'exec-1', accountName: 'Internal', provider: 'LPX' },
      wallet: { id: 'w1' },
    })

    const res = await service.findOne('broker-1', false)
    expect(res).toBeDefined()
    // ensure we did not request executionAccount in the select object
    expect(prisma.broker.findUnique).toHaveBeenCalled()
    const callArg = prisma.broker.findUnique.mock.calls[0][0]
    expect(callArg.select.executionAccount).toBeUndefined()
    expect(res.wallet).toBeDefined()
  })

  it('includes executionAccount when includeExecutionAccount=true', async () => {
    prisma.broker.findUnique.mockResolvedValue({
      id: 'broker-1',
      companyName: 'Test Broker',
      executionAccount: { id: 'exec-1', accountName: 'Internal', provider: 'LPX' },
      wallet: { id: 'w1' },
    })

    const res = await service.findOne('broker-1', true)
    expect(res).toBeDefined()
    expect((res as any).executionAccount).toBeDefined()
    expect((res as any).executionAccount.accountName).toBe('Internal')
  })
})

describe('BrokerService.generateApiCredentials constraint', () => {
  const prisma: any = {
    broker: {
      findUnique: jest.fn(),
    },
    brokerApiCredential: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    tradingClient: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  }

  let service: BrokerService
  const mailService: any = {
    sendBrokerStatusEmail: (jest.fn() as any).mockResolvedValue(true),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    service = new BrokerService(prisma, mailService)
  })

  it('throws BadRequestException if general API key already exists', async () => {
    prisma.broker.findUnique.mockResolvedValue({ status: 'APPROVED', apiEnabled: true })
    prisma.brokerApiCredential.findFirst.mockResolvedValue({ id: 'cred-1', isActive: true })

    await expect(service.generateApiCredentials('broker-1')).rejects.toThrow(
      'An active API key already exists. Revoke it before generating a new one.'
    )
  })

  it('throws BadRequestException if Algo Connect key already exists', async () => {
    prisma.broker.findUnique.mockResolvedValue({ status: 'APPROVED', companyName: 'Broker', email: 'test@broker.com' })
    prisma.brokerApiCredential.findFirst.mockResolvedValue({ id: 'cred-2', isActive: true })

    await expect(service.generateAlgoConnect('broker-1')).rejects.toThrow(
      'An active Algo Connect API key already exists. Revoke it before generating a new one.'
    )
  })
})
