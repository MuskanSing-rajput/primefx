import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { CreateClientInput, UpdateClientInput, PaginationQueryInput } from '@lp/validators'

@Injectable()
export class ClientService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(brokerId: string, query: PaginationQueryInput) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const where = {
      brokerId, // Mandatory broker isolation
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { externalClientId: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [data, total] = await Promise.all([
      this.prisma.tradingClient.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: { positions: { where: { status: 'OPEN' } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tradingClient.count({ where }),
    ])

    return {
      data: data.map((c) => ({
        ...c,
        openPositionsCount: c._count.positions,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async findOne(id: string, brokerId: string) {
    const client = await this.prisma.tradingClient.findFirst({
      where: { id, brokerId },
      include: {
        positions: {
          include: { symbol: { select: { name: true } } },
          orderBy: { openedAt: 'desc' },
        },
      },
    })
    if (!client) throw new NotFoundException('Client not found')
    return client
  }

  async create(brokerId: string, dto: CreateClientInput) {
    const existing = await this.prisma.tradingClient.findFirst({
      where: { brokerId, externalClientId: dto.externalClientId },
    })
    if (existing) throw new ConflictException(`Client ID ${dto.externalClientId} already exists`)

    return this.prisma.tradingClient.create({
      data: {
        ...dto,
        brokerId,
      },
    })
  }

  async update(id: string, brokerId: string, dto: UpdateClientInput) {
    await this.findOne(id, brokerId)
    return this.prisma.tradingClient.update({
      where: { id },
      data: dto,
    })
  }
}
