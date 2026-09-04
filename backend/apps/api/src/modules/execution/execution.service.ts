import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { CreateExecutionAccountInput } from '@lp/validators'
import { Prisma } from '@prisma/client'

@Injectable()
export class ExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.executionAccount.findMany({
      include: {
        broker: {
          select: { id: true, companyName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string) {
    const account = await this.prisma.executionAccount.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, companyName: true } },
      },
    })
    if (!account) throw new NotFoundException('Execution account not found')
    return account
  }

  async create(dto: CreateExecutionAccountInput) {
    return this.prisma.executionAccount.create({
      data: {
        accountName: dto.accountName,
        provider: dto.provider,
        accountNumber: dto.accountNumber,
        serverAddress: dto.serverAddress,
        maxExposure: new Prisma.Decimal(dto.maxExposure),
        credentials: dto.credentials, // Encrypted at application boundary in production
        status: 'active',
      },
    })
  }

  async assignToBroker(executionAccountId: string, brokerId: string) {
    const account = await this.findOne(executionAccountId)
    const broker = await this.prisma.broker.findUnique({ where: { id: brokerId } })
    if (!broker) throw new NotFoundException('Broker not found')

    return this.prisma.broker.update({
      where: { id: brokerId },
      data: { executionAccountId: account.id },
    })
  }
}
