import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { CreateSymbolInput, UpdateSymbolInput, PaginationQueryInput } from '@lp/validators'
import { SymbolCategory } from '@lp/shared-types'

@Injectable()
export class SymbolService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(category?: SymbolCategory, activeOnly = true) {
    return this.prisma.tradingSymbol.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { name: 'asc' },
    })
  }

  async findOne(id: string) {
    const symbol = await this.prisma.tradingSymbol.findUnique({
      where: { id },
    })
    if (!symbol) throw new NotFoundException('Trading symbol not found')
    return symbol
  }

  async create(dto: CreateSymbolInput) {
    const existing = await this.prisma.tradingSymbol.findUnique({
      where: { name: dto.name },
    })
    if (existing) throw new ConflictException(`Symbol ${dto.name} already exists`)

    return this.prisma.tradingSymbol.create({
      data: {
        ...dto,
        category: dto.category as SymbolCategory,
      },
    })
  }

  async update(id: string, dto: UpdateSymbolInput) {
    await this.findOne(id)
    return this.prisma.tradingSymbol.update({
      where: { id },
      data: dto,
    })
  }

  async toggleActive(id: string) {
    const symbol = await this.findOne(id)
    return this.prisma.tradingSymbol.update({
      where: { id },
      data: { isActive: !symbol.isActive },
    })
  }
}
