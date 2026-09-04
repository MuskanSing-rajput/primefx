import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'

/**
 * ReportingService — Revenue model analytics
 *
 * Implements the Cost + Markup revenue model reporting:
 *   LP Revenue     = sum of lpRevenue across all orders (raw commissions)
 *   Broker Revenue = sum of brokerRevenue across all orders (markup commissions)
 *   Client Spread  = LP raw spread + spread markup (informational)
 *
 * No rebates are paid from platform to brokers.
 * Each broker determines its own client pricing within platform limits.
 */
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  private summarizeSpreadRows<T extends {
    lpRawSpread: unknown
    spreadMarkupApplied: unknown
    clientSpread: unknown
    spreadMarkupRevenue: unknown
  }>(rows: T[]) {
    const totals = rows.reduce(
      (acc, row) => {
        acc.lpRawSpreadPips += Number(row.lpRawSpread)
        acc.spreadMarkupPips += Number(row.spreadMarkupApplied)
        acc.clientSpreadPips += Number(row.clientSpread)
        acc.spreadMarkupRevenueUSD += Number(row.spreadMarkupRevenue)
        return acc
      },
      {
        lpRawSpreadPips: 0,
        spreadMarkupPips: 0,
        clientSpreadPips: 0,
        spreadMarkupRevenueUSD: 0,
      },
    )

    return {
      totalLpRawSpreadPips: totals.lpRawSpreadPips.toFixed(5),
      totalSpreadMarkupPips: totals.spreadMarkupPips.toFixed(5),
      totalSpreadMarkupRevenue: totals.spreadMarkupRevenueUSD.toFixed(2),
      totalClientSpreadPips: totals.clientSpreadPips.toFixed(5),
      averageClientSpreadPips: rows.length > 0
        ? (totals.clientSpreadPips / rows.length).toFixed(5)
        : '0.00000',
    }
  }

  async getTradeReport(brokerId?: string) {
    return this.prisma.order.findMany({
      where: { ...(brokerId ? { brokerId } : {}), status: 'FILLED' },
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        side: true,
        type: true,
        status: true,
        requestedVolume: true,
        filledVolume: true,
        executionPrice: true,
        slippage: true,
        openedAt: true,
        closedAt: true,
        // Cost + Markup breakdown
        lpRawSpread: true,
        lpRawCommission: true,
        spreadMarkupApplied: true,
        spreadMarkupRevenue: true,
        commissionMarkupApplied: true,
        clientSpread: true,
        clientCommission: true,
        lpRevenue: true,
        brokerRevenue: true,
        pricingProfileId: true,
        symbol: { select: { name: true, displayName: true } },
        client: { select: { firstName: true, lastName: true } },
      },
    })
  }

  async getPnLReport(brokerId?: string) {
    const positions = await this.prisma.position.findMany({
      where: { ...(brokerId ? { brokerId } : {}) },
      select: {
        closedPnl: true,
        floatingPnl: true,
        commission: true,
        swap: true,
        status: true,
      },
    })

    const totalClosedPnl   = positions.reduce((s, p) => s + Number(p.closedPnl),   0)
    const totalFloatingPnl = positions.reduce((s, p) => s + Number(p.floatingPnl), 0)
    const totalCommission  = positions.reduce((s, p) => s + Number(p.commission),   0)
    const totalSwap        = positions.reduce((s, p) => s + Number(p.swap),         0)
    const openCount        = positions.filter(p => p.status === 'OPEN').length
    const closedCount      = positions.filter(p => p.status === 'CLOSED').length

    return {
      totalClosedPnl:   totalClosedPnl.toFixed(2),
      totalFloatingPnl: totalFloatingPnl.toFixed(2),
      totalCommission:  totalCommission.toFixed(2),
      totalSwap:        totalSwap.toFixed(2),
      netPnl:           (totalClosedPnl + totalFloatingPnl - totalCommission - totalSwap).toFixed(2),
      openPositions:    openCount,
      closedPositions:  closedCount,
      totalPositions:   positions.length,
    }
  }

  /**
   * Revenue Report — Platform view (SuperAdmin) or Broker view
   *
   * Shows the Cost + Markup revenue model breakdown:
   *   - LP Platform earns: lpRevenue (raw commission spread cost)
   *   - Broker earns:      brokerRevenue (markup they charged clients)
   *   - No rebates are paid from platform to brokers
   */
  async getRevenueReport(brokerId?: string, from?: Date, to?: Date) {
    const where = {
      ...(brokerId ? { brokerId } : {}),
      status: 'FILLED' as const,
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to   ? { lte: to   } : {}),
            },
          }
        : {}),
    }

    const orders = await this.prisma.order.findMany({
      where,
      select: {
        lpRawSpread: true,
        lpRawCommission: true,
        spreadMarkupApplied: true,
        clientSpread: true,
        spreadMarkupRevenue: true,
        lpRevenue: true,
        brokerRevenue: true,
        filledVolume: true,
        brokerId: true,
        createdAt: true,
        symbol: { select: { name: true, category: true } },
      },
    })

    const totalLpRevenue      = orders.reduce((s, o) => s + Number(o.lpRevenue),      0)
    const totalBrokerRevenue  = orders.reduce((s, o) => s + Number(o.brokerRevenue),  0)
    const totalVolume         = orders.reduce((s, o) => s + Number(o.filledVolume),   0)
    const totalRevenue        = totalLpRevenue + totalBrokerRevenue
    const spreadSummary       = this.summarizeSpreadRows(orders)

    // Group by symbol for breakdown
    const bySymbol = orders.reduce<Record<string, { lpRev: number; brokerRev: number; count: number }>>(
      (acc, o) => {
        const sym = o.symbol.name
        if (!acc[sym]) acc[sym] = { lpRev: 0, brokerRev: 0, count: 0 }
        acc[sym].lpRev     += Number(o.lpRevenue)
        acc[sym].brokerRev += Number(o.brokerRevenue)
        acc[sym].count     += 1
        return acc
      },
      {},
    )

    return {
      summary: {
        totalLpRevenue:     totalLpRevenue.toFixed(2),
        totalBrokerRevenue: totalBrokerRevenue.toFixed(2),
        totalCombinedRevenue: totalRevenue.toFixed(2),
        totalTrades:        orders.length,
        totalVolumeLots:    totalVolume.toFixed(2),
        totalLpRawSpreadPips: spreadSummary.totalLpRawSpreadPips,
        totalSpreadMarkupPips: spreadSummary.totalSpreadMarkupPips,
        totalSpreadMarkupRevenue: spreadSummary.totalSpreadMarkupRevenue,
        totalClientSpreadPips: spreadSummary.totalClientSpreadPips,
        averageClientSpreadPips: spreadSummary.averageClientSpreadPips,
        // Note: platform does NOT pay rebates
        rebatesPaid:        '0.00',
      },
      breakdown: {
        costPlusMarkupModel: {
          description:
            'LP earns raw commission and raw spread; Broker earns markup on top. No rebates paid.',
          lpSharePercent:
            totalRevenue > 0
              ? ((totalLpRevenue / totalRevenue) * 100).toFixed(1)
              : '0.0',
          brokerSharePercent:
            totalRevenue > 0
              ? ((totalBrokerRevenue / totalRevenue) * 100).toFixed(1)
              : '0.0',
        },
        bySymbol: Object.entries(bySymbol)
          .map(([name, d]) => ({
            symbol: name,
            tradeCount: d.count,
            lpRevenue: d.lpRev.toFixed(2),
            brokerRevenue: d.brokerRev.toFixed(2),
          }))
          .sort((a, b) => parseFloat(b.brokerRevenue) - parseFloat(a.brokerRevenue)),
      },
    }
  }

  /**
   * Pricing Profile Effectiveness Report
   *
   * Shows which pricing profiles generated the most broker revenue,
   * helping brokers optimize their pricing strategy.
   * Brokers are responsible for determining their own client pricing
   * within platform-defined limits.
   */
  async getPricingProfileReport(brokerId: string) {
    const profileOrders = await this.prisma.order.groupBy({
      by: ['pricingProfileId'],
      where: { brokerId, status: 'FILLED' },
      _count: { id: true },
      _sum: {
        brokerRevenue: true,
        lpRevenue: true,
        filledVolume: true,
        commissionMarkupApplied: true,
        spreadMarkupApplied: true,
      },
    })

    const profileIds = profileOrders
      .map(p => p.pricingProfileId)
      .filter(Boolean) as string[]

    const profiles = profileIds.length > 0
      ? await this.prisma.pricingProfile.findMany({
          where: { id: { in: profileIds } },
          select: { id: true, name: true, isDefault: true },
        })
      : []

    const profileMap = new Map(profiles.map(p => [p.id, p]))

    return profileOrders.map(row => ({
      profileId:    row.pricingProfileId,
      profileName:  row.pricingProfileId ? profileMap.get(row.pricingProfileId)?.name ?? 'Unknown' : 'LP Raw (No Profile)',
      isDefault:    row.pricingProfileId ? profileMap.get(row.pricingProfileId)?.isDefault ?? false : false,
      tradeCount:   row._count.id,
      totalVolume:  Number(row._sum.filledVolume ?? 0).toFixed(2),
      brokerRevenue: Number(row._sum.brokerRevenue ?? 0).toFixed(2),
      lpRevenue:    Number(row._sum.lpRevenue ?? 0).toFixed(2),
      avgSpreadMarkup:    Number(row._sum.spreadMarkupApplied ?? 0).toFixed(5),
      avgCommissionMarkup: Number(row._sum.commissionMarkupApplied ?? 0).toFixed(2),
    }))
  }

  async getBrokerThresholdStatus(brokerId: string) {
    const billingMonth = new Date().toISOString().slice(0, 7)

    const [config, ledger] = await Promise.all([
      this.prisma.brokerSpreadConfig.findUnique({
        where: { brokerId },
        select: { freeLotsThreshold: true, commissionPerLot: true } as any,
      }) as any,
      (this.prisma as any).brokerCommissionLedger.findUnique({
        where: { brokerId_billingMonth: { brokerId, billingMonth } },
      }),
    ])

    const threshold       = Number(config?.freeLotsThreshold ?? 0)
    const totalLots       = Number(ledger?.totalLotsTraded ?? 0)
    const freeUsed        = Number(ledger?.freeLotsUsed ?? 0)
    const chargeableLots  = Number(ledger?.chargeableLots ?? 0)
    const commissionEarned = Number(ledger?.totalCommission ?? 0)
    const freeRemaining   = Math.max(0, threshold - totalLots)
    const percentUsed     = threshold > 0 ? Math.min(100, (totalLots / threshold) * 100) : 100

    return {
      billingMonth,
      threshold,
      totalLotsThisMonth: totalLots,
      freeLotsUsed:       freeUsed,
      freeLotsRemaining:  freeRemaining,
      chargeableLots,
      commissionThisMonth: commissionEarned,
      percentUsed,
      commissionPerLot:   Number(config?.commissionPerLot ?? 0),
    }
  }
}
