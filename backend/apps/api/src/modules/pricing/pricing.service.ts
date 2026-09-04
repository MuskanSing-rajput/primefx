import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { CreatePricingProfileInput, UpdatePricingProfileInput, ProfileSymbolOverrideInput } from '@lp/validators'
import { Prisma } from '@prisma/client'

type PricingLimits = {
  spreadMarkupMax: number
  commissionMarkupMax: number
  swapMarkupAbsMax: number
}

const PRICING_LIMIT_KEYS = {
  spreadMarkupMax: 'pricing_spread_markup_max',
  commissionMarkupMax: 'pricing_commission_markup_max',
  swapMarkupAbsMax: 'pricing_swap_markup_abs_max',
} as const

const PRICING_LIMIT_DEFAULTS: PricingLimits = {
  spreadMarkupMax: 10,
  commissionMarkupMax: 500,
  swapMarkupAbsMax: 2000,
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private parseLimit(value: string | null | undefined, fallback: number): number {
    if (value === null || value === undefined) {
      return fallback
    }

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  private async getPricingLimits(): Promise<PricingLimits> {
    const settings = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            PRICING_LIMIT_KEYS.spreadMarkupMax,
            PRICING_LIMIT_KEYS.commissionMarkupMax,
            PRICING_LIMIT_KEYS.swapMarkupAbsMax,
          ],
        },
      },
    })

    const map = new Map(settings.map((setting) => [setting.key, setting.value]))

    return {
      spreadMarkupMax: this.parseLimit(map.get(PRICING_LIMIT_KEYS.spreadMarkupMax), PRICING_LIMIT_DEFAULTS.spreadMarkupMax),
      commissionMarkupMax: this.parseLimit(map.get(PRICING_LIMIT_KEYS.commissionMarkupMax), PRICING_LIMIT_DEFAULTS.commissionMarkupMax),
      swapMarkupAbsMax: this.parseLimit(map.get(PRICING_LIMIT_KEYS.swapMarkupAbsMax), PRICING_LIMIT_DEFAULTS.swapMarkupAbsMax),
    }
  }

  private assertWithinRange(value: number, min: number, max: number, label: string) {
    if (value < min || value > max) {
      throw new BadRequestException(`${label} must be between ${min} and ${max}`)
    }
  }

  async findProfilesByBroker(brokerId: string) {
    return this.prisma.pricingProfile.findMany({
      where: { brokerId },
      include: {
        symbolOverrides: {
          include: { symbol: { select: { name: true, displayName: true } } },
        },
      },
      orderBy: { isDefault: 'desc' },
    })
  }

  private async validateMarkups(
    spreadMarkup?: string | number | Prisma.Decimal | null,
    commissionMarkup?: string | number | Prisma.Decimal | null,
    swapLong?: string | number | Prisma.Decimal | null,
    swapShort?: string | number | Prisma.Decimal | null
  ) {
    const limits = await this.getPricingLimits()

    if (spreadMarkup !== undefined && spreadMarkup !== null) {
      const val = Number(spreadMarkup)
      this.assertWithinRange(val, 0, limits.spreadMarkupMax, 'Spread markup')
    }
    if (commissionMarkup !== undefined && commissionMarkup !== null) {
      const val = Number(commissionMarkup)
      this.assertWithinRange(val, 0, limits.commissionMarkupMax, 'Commission markup')
    }
    if (swapLong !== undefined && swapLong !== null) {
      const val = Number(swapLong)
      this.assertWithinRange(val, -limits.swapMarkupAbsMax, limits.swapMarkupAbsMax, 'Swap markup long')
    }
    if (swapShort !== undefined && swapShort !== null) {
      const val = Number(swapShort)
      this.assertWithinRange(val, -limits.swapMarkupAbsMax, limits.swapMarkupAbsMax, 'Swap markup short')
    }
  }

  async createProfile(brokerId: string, dto: CreatePricingProfileInput) {
    await this.validateMarkups(
      dto.spreadMarkup,
      dto.commissionMarkup,
      dto.swapMarkupLong,
      dto.swapMarkupShort
    )

    return this.prisma.pricingProfile.create({
      data: {
        brokerId,
        name: dto.name,
        spreadMarkup: new Prisma.Decimal(dto.spreadMarkup),
        commissionMarkup: new Prisma.Decimal(dto.commissionMarkup),
        swapMarkupLong: new Prisma.Decimal(dto.swapMarkupLong),
        swapMarkupShort: new Prisma.Decimal(dto.swapMarkupShort),
        isDefault: dto.isDefault ?? false,
      },
    })
  }

  async updateProfile(id: string, brokerId: string, dto: UpdatePricingProfileInput) {
    const profile = await this.prisma.pricingProfile.findFirst({
      where: { id, brokerId },
    })

    if (!profile) throw new NotFoundException('Pricing profile not found')

    await this.validateMarkups(
      dto.spreadMarkup,
      dto.commissionMarkup,
      dto.swapMarkupLong,
      dto.swapMarkupShort
    )

    return this.prisma.pricingProfile.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.spreadMarkup !== undefined ? { spreadMarkup: new Prisma.Decimal(dto.spreadMarkup) } : {}),
        ...(dto.commissionMarkup !== undefined ? { commissionMarkup: new Prisma.Decimal(dto.commissionMarkup) } : {}),
        ...(dto.swapMarkupLong !== undefined ? { swapMarkupLong: new Prisma.Decimal(dto.swapMarkupLong) } : {}),
        ...(dto.swapMarkupShort !== undefined ? { swapMarkupShort: new Prisma.Decimal(dto.swapMarkupShort) } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    })
  }

  async upsertOverride(profileId: string, brokerId: string, dto: ProfileSymbolOverrideInput) {
    const profile = await this.prisma.pricingProfile.findFirst({
      where: { id: profileId, brokerId },
    })

    if (!profile) throw new NotFoundException('Pricing profile not found')

    const symbol = await this.prisma.tradingSymbol.findUnique({
      where: { id: dto.symbolId },
      select: { id: true },
    })

    if (!symbol) {
      throw new NotFoundException('Trading symbol not found')
    }

    await this.validateMarkups(
      dto.spreadMarkup,
      dto.commissionOverride,
      dto.swapOverrideLong,
      dto.swapOverrideShort
    )

    return this.prisma.profileSymbolOverride.upsert({
      where: {
        profileId_symbolId: { profileId, symbolId: dto.symbolId },
      },
      create: {
        profileId,
        symbolId: dto.symbolId,
        spreadMarkup: dto.spreadMarkup ? new Prisma.Decimal(dto.spreadMarkup) : null,
        commissionOverride: dto.commissionOverride ? new Prisma.Decimal(dto.commissionOverride) : null,
        swapOverrideLong: dto.swapOverrideLong ? new Prisma.Decimal(dto.swapOverrideLong) : null,
        swapOverrideShort: dto.swapOverrideShort ? new Prisma.Decimal(dto.swapOverrideShort) : null,
      },
      update: {
        spreadMarkup: dto.spreadMarkup ? new Prisma.Decimal(dto.spreadMarkup) : null,
        commissionOverride: dto.commissionOverride ? new Prisma.Decimal(dto.commissionOverride) : null,
        swapOverrideLong: dto.swapOverrideLong ? new Prisma.Decimal(dto.swapOverrideLong) : null,
        swapOverrideShort: dto.swapOverrideShort ? new Prisma.Decimal(dto.swapOverrideShort) : null,
      },
    })
  }
}
