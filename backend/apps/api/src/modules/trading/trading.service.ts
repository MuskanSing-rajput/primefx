import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { RedisService } from '../../redis/redis.service'
import { PlaceOrderInput, ModifyOrderInput, PaginationQueryInput } from '@lp/validators'
import { OrderSide, OrderType, OrderStatus, PositionStatus } from '@lp/shared-types'
import { Prisma } from '@prisma/client'

/**
 * TradingService — Core order execution and position management
 *
 * PRICING MODEL (Commission-Only Revenue):
 * ─────────────────────────────────────────────────────────────────────────
 * 1. LP markup spread is baked into the live WebSocket price stream by PriceFeedService
 *    at publish time (per BrokerSpreadConfig). It is NOT re-applied here.
 * 2. LP revenue = BrokerSpreadConfig.commissionPerLot × filledLots (proportional)
 * 3. Broker's own client-facing commission (PricingProfile.commissionMarkup) is tracked
 *    separately and belongs to the broker — LP does not earn from it.
 * 4. Revenue fields recorded on Order for full transparency:
 *      lpRevenue              = commissionPerLot × lots
 *      brokerRevenue          = brokerCommissionMarkup × lots
 *      spreadMarkupApplied    = pips recorded for reference (already in fill price)
 *      lpRawSpread            = live raw spread from Redis at fill time
 * ─────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name)
  private readonly maxPriceAgeMs = 5000

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private async getFreshMarketQuote(symbolName: string) {
    const livePrice = await this.redis.getPrice(symbolName)

    if (!livePrice?.bid || !livePrice.ask || !livePrice.ts) {
      throw new BadRequestException(`No live market price available for ${symbolName}`)
    }

    const bid = Number.parseFloat(livePrice.bid)
    const ask = Number.parseFloat(livePrice.ask)
    const timestamp = Number(livePrice.ts)

    if (
      !Number.isFinite(bid) ||
      !Number.isFinite(ask) ||
      bid <= 0 ||
      ask <= 0 ||
      ask < bid ||
      !Number.isFinite(timestamp) ||
      Date.now() - timestamp > this.maxPriceAgeMs
    ) {
      throw new BadRequestException(`Stale or invalid market price for ${symbolName}`)
    }

    return { bid, ask, timestamp }
  }

  async placeOrder(brokerId: string, dto: PlaceOrderInput) {
    // ─── 1. Verify broker has execution account ──────────────────────────
    let broker = await this.prisma.broker.findUnique({
      where: { id: brokerId },
      include: { wallet: true, executionAccount: true, demoExecutionAccount: true },
    })

    if (!broker) {
      throw new NotFoundException('Broker not found')
    }

    // Ensure active execution account is assigned/available based on trading mode
    if (broker.tradingMode === 'DEMO') {
      if (!broker.demoExecutionAccountId || !broker.demoExecutionAccount) {
        const defaultExecAccount = await this.getOrCreateDefaultExecutionAccount(broker.id, broker.companyName)
        broker = await this.prisma.broker.update({
          where: { id: brokerId },
          data: { demoExecutionAccountId: defaultExecAccount.id },
          include: { wallet: true, executionAccount: true, demoExecutionAccount: true },
        })
        this.logger.log(`Auto-assigned default MOCK execution account ${defaultExecAccount.id} to broker ${brokerId}`)
      }
    } else {
      if (!broker.executionAccountId || !broker.executionAccount) {
        throw new BadRequestException('No live MT5 MetaAPI account is connected to this broker.')
      }
    }

    const activeExecutionAccount = broker.tradingMode === 'LIVE' ? broker.executionAccount! : broker.demoExecutionAccount!

    // ─── 2. Resolve client (Individual Client or Broker Master House Account) ───
    let client: any = null
    if (dto.clientId) {
      client = await this.prisma.tradingClient.findFirst({
        where: { id: dto.clientId, brokerId },
      })
      if (!client || !client.isActive) {
        throw new NotFoundException('Client not found or inactive')
      }
    } else {
      // Direct A-Book pass-through: execute under the Broker's Master House account
      client = await this.getOrCreateMasterHouseClient(brokerId, broker.companyName, broker.email)
    }

    // ─── 3. Resolve trading symbol ─────────────────────────────────────
    let symbol: any = null
    if (dto.symbolId) {
      symbol = await this.prisma.tradingSymbol.findUnique({
        where: { id: dto.symbolId },
      })
    } else if (dto.symbol) {
      const cleanSymbol = dto.symbol.trim()
      symbol = await this.prisma.tradingSymbol.findFirst({
        where: {
          name: { equals: cleanSymbol, mode: 'insensitive' },
        },
      })
    }

    if (!symbol || !symbol.isActive) {
      throw new BadRequestException(
        `Symbol '${dto.symbol || dto.symbolId || ''}' is not active for trading`,
      )
    }

    // ─── 4. Get fresh live market price from Redis ───────────────────────
    // The price in Redis already has the LP markup baked in (set by PriceFeedService).
    // So the fill price is the markup-applied bid/ask — no additional spread is added here.
    const liveQuote = await this.getFreshMarketQuote(symbol.name)
    const fillPrice = dto.side === 'BUY' ? liveQuote.ask : liveQuote.bid
    const volume = new Prisma.Decimal(String(dto.volume))
    const contractSize = new Prisma.Decimal(String(symbol.contractSize))

    // ─── 5. Load LP spread config & commission rate ──────────────────────
    // BrokerSpreadConfig.commissionPerLot = what LP charges per standard lot
    // BrokerSpreadConfig.globalMarkupPips  = LP markup already baked into streamed price
    // We do NOT re-apply spread markup here — it was applied at publish time.
    const spreadConfig = await this.prisma.brokerSpreadConfig.findUnique({
      where: { brokerId },
      include: { symbolOverrides: true },
    })

    const commissionPerLot = new Prisma.Decimal(String(spreadConfig?.commissionPerLot ?? 0))

    // ─── 6. Resolve spread markup for record-keeping only ────────────────
    // The spread is already in the fill price. We record what markup was applied.
    const override = spreadConfig?.symbolOverrides.find((o) => o.symbolName === symbol.name)
    const spreadMarkupPips = new Prisma.Decimal(
      String(override?.markupPips ?? spreadConfig?.globalMarkupPips ?? 0),
    )

    // Read live raw spread from Redis (stored by PriceFeedService before markup)
    const rawQuote = await this.redis.getBrokerRawPrice(brokerId, symbol.name)
    const rawSpreadPips = rawQuote
      ? new Prisma.Decimal(rawQuote.rawSpread)
      : new Prisma.Decimal(String(symbol.rawSpread)) // fallback to static if feed not started

    // ─── 7. Broker's own client-facing pricing profile (optional) ────────
    // This is what the broker charges their end-clients on top.
    // LP does not earn from this — it belongs to the broker.
    const pricingProfile = dto.pricingProfileId
      ? await this.prisma.pricingProfile.findFirst({
          where: { id: dto.pricingProfileId, brokerId },
          include: {
            symbolOverrides: {
              where: { symbolId: symbol.id },
              select: { commissionOverride: true },
            },
          },
        })
      : await this.prisma.pricingProfile.findFirst({
          where: { brokerId, isDefault: true },
          include: {
            symbolOverrides: {
              where: { symbolId: symbol.id },
              select: { commissionOverride: true },
            },
          },
        })
    const brokerCommissionMarkup = new Prisma.Decimal(
      String(
        pricingProfile?.symbolOverrides?.[0]?.commissionOverride ??
        pricingProfile?.commissionMarkup ??
        0,
      ),
    )

    // ─── 8. Revenue calculation ──────────────────────────────────────────
    const lots = volume  // 1 unit = 1 standard lot
    // LP revenue = LP commission per lot × filled lots (spread already captured in price)
    let lpRevenueUSD = commissionPerLot.mul(lots)
    // Broker revenue = broker's commission markup per lot × filled lots
    const brokerRevenueUSD = brokerCommissionMarkup.mul(lots)
    // Total commission the client sees = (LP commission + broker markup) * lots
    let clientCommissionUSD = commissionPerLot.plus(brokerCommissionMarkup).mul(lots)

    // ─── 9. Slippage tracking ─────────────────────────────────────────────
    let priceValidated = true
    let slippagePips = new Prisma.Decimal(0)
    if (dto.requestedPrice) {
      const reqPrice = new Prisma.Decimal(String(dto.requestedPrice))
      const pipSize = new Prisma.Decimal(10).pow(-(symbol.digits - 1))
      slippagePips = new Prisma.Decimal(fillPrice).minus(reqPrice).div(pipSize)
      const maxDeviationPips = 3.0
      if (Math.abs(Number(slippagePips)) > maxDeviationPips) {
        priceValidated = false
        this.logger.warn(
          `Order slippage ${slippagePips.toFixed(1)} pips exceeds ${maxDeviationPips} pip limit for ${symbol.name}`
        )
      }
    }

    // ─── 10. Credit check — required margin ──────────────────────────────
    const requiredMargin = new Prisma.Decimal(String(fillPrice))
      .mul(volume)
      .mul(contractSize)
      .div(new Prisma.Decimal(String(client.leverage)))

    // ─── 11. Execute atomically in DB transaction ─────────────────────────
    return this.prisma.$transaction(async (tx) => {
      if (!broker.wallet) {
        throw new BadRequestException('Broker wallet not found')
      }

      const billingMonth = new Date().toISOString().slice(0, 7)
      let freeLotsThreshold = new Prisma.Decimal(0)

      if (broker.tradingMode === 'LIVE') {
        const liveSpreadConfig: any = await (tx as any).brokerSpreadConfig.findUnique({
          where: { brokerId },
          select: { freeLotsThreshold: true } as any,
        })
        freeLotsThreshold = new Prisma.Decimal(String(liveSpreadConfig?.freeLotsThreshold ?? 0))

        const { chargeableLots, freeLotsConsumed } = await this.computeChargeableLots(
          tx,
          brokerId,
          lots,
          freeLotsThreshold,
          billingMonth,
        )

        lpRevenueUSD = commissionPerLot.mul(chargeableLots)
        clientCommissionUSD = lpRevenueUSD.plus(brokerRevenueUSD)

        await (tx as any).brokerCommissionLedger.upsert({
          where: { brokerId_billingMonth: { brokerId, billingMonth } },
          create: {
            brokerId,
            billingMonth,
            totalLotsTraded:   lots,
            freeLotsUsed:      freeLotsConsumed,
            chargeableLots:    chargeableLots,
            totalCommission:   lpRevenueUSD,
            thresholdSnapshot: freeLotsThreshold,
          },
          update: {
            totalLotsTraded:   { increment: lots },
            freeLotsUsed:      { increment: freeLotsConsumed },
            chargeableLots:    { increment: chargeableLots },
            totalCommission:   { increment: lpRevenueUSD },
          },
        })
      }

      const openPositions = await tx.position.findMany({
        where: { brokerId, status: 'OPEN' },
      })

      const totalFloatingPnl = openPositions.reduce((sum, p) => sum + Number(p.floatingPnl), 0)
      const usedMargin = openPositions.reduce((sum, p) => sum + Number(p.marginReservedUSD || 0), 0)

      const balances = {
        USDT: Number(broker.wallet.balanceUSDT),
        USDC: Number(broker.wallet.balanceUSDC),
        BTC: Number(broker.wallet.balanceBTC),
        ETH: Number(broker.wallet.balanceETH),
      }

      const walletBalance = balances.USDT + balances.USDC + (balances.BTC * 60000) + (balances.ETH * 3000)
      const creditLimit = Number(broker.wallet.totalCreditUSD)
      const equity = walletBalance + creditLimit + totalFloatingPnl
      const availableMargin = equity - usedMargin

      if (new Prisma.Decimal(availableMargin).lt(requiredMargin)) {
        throw new BadRequestException(
          `Insufficient available margin. Required: $${requiredMargin.toFixed(2)}, ` +
          `Available: $${availableMargin.toFixed(2)}`
        )
      }

      await tx.wallet.update({
        where: { id: broker.wallet.id },
        data: {
          usedCreditUSD:      { increment: requiredMargin },
          availableCreditUSD: { decrement: requiredMargin },
        },
      })

      let externalId: string | null = null

      if (activeExecutionAccount.provider === 'metaapi') {
        const creds = activeExecutionAccount.credentials as any
        const accountId = creds?.accountId
        const token = creds?.token

        if (!accountId || !token) {
          throw new BadRequestException('MetaAPI credentials are not fully configured.')
        }

        const symbolMapping = creds?.symbolMapping || {}
        const mappedSymbol = symbolMapping[symbol.name] || symbol.name

        const actionType = dto.side === 'BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL'
        const tradeRes = await fetch(
          `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${accountId}/trade`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'auth-token': token,
            },
            body: JSON.stringify({
              actionType,
              symbol: mappedSymbol,
              volume: Number(volume),
              stopLoss: dto.stopLoss ? Number(dto.stopLoss) : undefined,
              takeProfit: dto.takeProfit ? Number(dto.takeProfit) : undefined,
            }),
          },
        )

        if (!tradeRes.ok) {
          const errText = await tradeRes.text()
          let errMsg = 'Failed to execute trade on MT5'
          try {
            const parsed = JSON.parse(errText)
            errMsg = parsed.message || parsed.stringCode || errMsg
          } catch (e) {}
          throw new BadRequestException(`MT5 Direct Execution Error: ${errMsg}`)
        }

        const tradeResult = await tradeRes.json() as any
        externalId = String(tradeResult.positionId || tradeResult.orderId || '')
      }

      const externalRef = externalId || dto.externalId || dto.clientReference || null

      // ─── Create Order with full pricing breakdown ─────────────────────
      const order = await tx.order.create({
        data: {
          brokerId,
          clientId:          client.id,
          executionAccountId: activeExecutionAccount.id,
          symbolId:           symbol.id,
          side:               dto.side as OrderSide,
          type:               dto.type as OrderType,
          mode:               broker.tradingMode,
          requestedVolume:    volume,
          filledVolume:       volume,
          requestedPrice:     dto.requestedPrice ? new Prisma.Decimal(String(dto.requestedPrice)) : null,
          executionPrice:     new Prisma.Decimal(fillPrice),
          slippage:           !slippagePips.isZero() ? new Prisma.Decimal(slippagePips.toFixed(5)) : null,
          stopLoss:           dto.stopLoss ? new Prisma.Decimal(String(dto.stopLoss)) : null,
          takeProfit:         dto.takeProfit ? new Prisma.Decimal(String(dto.takeProfit)) : null,
          status:             OrderStatus.FILLED,
          priceValidationPassed: priceValidated,
          pricingProfileId:  dto.pricingProfileId ?? pricingProfile?.id ?? null,
          externalId:         externalRef,
          openedAt:          new Date(),
          // Revenue tracking (new commission-only model)
          lpRawSpread:              rawSpreadPips,
          lpRawCommission:          commissionPerLot,
          spreadMarkupApplied:      spreadMarkupPips,
          commissionMarkupApplied:  brokerCommissionMarkup,
          clientSpread:             rawSpreadPips.plus(spreadMarkupPips),
          clientCommission:         clientCommissionUSD,
          lpRevenue:                lpRevenueUSD,
          spreadMarkupRevenue:      new Prisma.Decimal(0),  // baked into price, not tracked here
          brokerRevenue:            brokerRevenueUSD,
        },
      })

      // ─── Create Position ──────────────────────────────────────────────
      const position = await tx.position.create({
        data: {
          brokerId,
          clientId:          client.id,
          symbolId:          symbol.id,
          executionAccountId: activeExecutionAccount.id,
          mode:              broker.tradingMode,
          orderId:           order.id,
          leverageAtOpen:    client.leverage,
          marginReservedUSD: requiredMargin,
          side:              dto.side as OrderSide,
          volume,
          openPrice:         new Prisma.Decimal(fillPrice),
          currentPrice:      new Prisma.Decimal(fillPrice),
          floatingPnl:       new Prisma.Decimal(0),
          commission:        clientCommissionUSD,
          status:            PositionStatus.OPEN,
          externalId:         externalRef,
          openedAt:          new Date(),
        },
      })

      return {
        order: {
          id: order.id,
          status: order.status,
          executionPrice: fillPrice.toFixed(symbol.digits),
          filledVolume: String(dto.volume),
          slippagePips: slippagePips.toFixed(1),
          pricing: {
            rawSpread:           rawSpreadPips.toFixed(5),
            spreadMarkupApplied: spreadMarkupPips.toFixed(5),
            lpCommissionPerLot:  commissionPerLot.toFixed(2),
            brokerCommission:    brokerCommissionMarkup.toFixed(2),
            clientCommission:    clientCommissionUSD.toFixed(2),
            lpRevenue:           lpRevenueUSD.toFixed(2),
            brokerRevenue:       brokerRevenueUSD.toFixed(2),
          },
        },
        position: {
          id:               position.id,
          status:           position.status,
          openPrice:        fillPrice.toFixed(symbol.digits),
          commission:       clientCommissionUSD.toFixed(2),
          leverageAtOpen:   client.leverage,
          marginReservedUSD: requiredMargin.toFixed(8),
        },
      }
    })
  }


  async closePosition(positionId: string, brokerId: string) {
    const position = await this.prisma.position.findFirst({
      where: {
        brokerId,
        status: PositionStatus.OPEN,
        OR: [
          { id: positionId },
          { externalId: positionId },
        ],
      },
      include: {
        symbol: { select: { name: true, contractSize: true, digits: true } },
        client: { select: { leverage: true } },
        executionAccount: true,
      },
    })

    if (!position) throw new NotFoundException('Open position not found')

    const liveQuote = await this.getFreshMarketQuote(position.symbol.name)
    const closePrice = position.side === OrderSide.BUY ? liveQuote.bid : liveQuote.ask

    // Calculate final realized PnL
    const openPrice = Number(position.openPrice)
    const volume = Number(position.volume)
    const contractSize = Number(position.symbol.contractSize)
    const rawPnl = position.side === OrderSide.BUY
      ? (closePrice - openPrice) * volume * contractSize
      : (openPrice - closePrice) * volume * contractSize

    // Commission on close (round-trip = open + close commission)
    const closingCommission = Number(position.commission) // same commission on close as open
    const netPnl = rawPnl - closingCommission

    return this.prisma.$transaction(async (tx) => {
      if (position.executionAccount?.provider === 'metaapi') {
        const creds = position.executionAccount.credentials as any
        const accountId = creds?.accountId
        const token = creds?.token

        if (!accountId || !token) {
          throw new BadRequestException('MetaAPI credentials are not fully configured.')
        }

        const externalId = position.externalId

        if (externalId) {
          const closeRes = await fetch(`https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${accountId}/trade`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'auth-token': token,
            },
            body: JSON.stringify({
              actionType: 'POSITION_CLOSE_ID',
              positionId: externalId,
            }),
          })

          if (!closeRes.ok) {
            const errText = await closeRes.text()
            let errMsg = 'Failed to close position on MT5'
            try {
              const parsed = JSON.parse(errText)
              errMsg = parsed.message || parsed.stringCode || errMsg
            } catch (e) {}
            throw new BadRequestException(`MT5 Direct Close Error: ${errMsg}`)
          }
        }
      }

      const closeResult = await tx.position.updateMany({
        where: { id: position.id, brokerId, status: PositionStatus.OPEN },
        data: {
          status:      PositionStatus.CLOSED,
          currentPrice: new Prisma.Decimal(closePrice),
          closedPnl:   new Prisma.Decimal(netPnl.toFixed(8)),
          closedAt:    new Date(),
        },
      })

      if (closeResult.count === 0) {
        throw new BadRequestException('Position is no longer open or has already been closed')
      }

      const closed = await tx.position.findUnique({
        where: { id: position.id },
      })

      if (!closed) {
        throw new BadRequestException('Position could not be loaded after close update')
      }

      // Update order closedAt
      if (position.orderId) {
        await tx.order.update({
          where: { id: position.orderId },
          data: { closedAt: new Date() },
        })
      }

      // Release margin (used → available)
      const wallet = await tx.wallet.findUnique({ where: { brokerId } })
      if (wallet) {
        const storedMarginReserved = position.marginReservedUSD
          ? new Prisma.Decimal(position.marginReservedUSD)
          : null
        const fallbackMargin = position.leverageAtOpen
          ? new Prisma.Decimal(openPrice).mul(volume).mul(contractSize).div(position.leverageAtOpen)
          : new Prisma.Decimal(openPrice).mul(volume).mul(contractSize).div(position.client.leverage)
        const marginReleased = storedMarginReserved ?? fallbackMargin
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            usedCreditUSD:      { decrement: new Prisma.Decimal(marginReleased.toFixed(8)) },
            availableCreditUSD: { increment: new Prisma.Decimal(marginReleased.toFixed(8)) },
            balanceUSDT:        { increment: new Prisma.Decimal(netPnl.toFixed(8)) },
          },
        })
      }

      return {
        id: closed.id,
        status: closed.status,
        closedPnl: netPnl.toFixed(2),
        closingCommission: closingCommission.toFixed(2),
        closedAt: closed.closedAt,
      }
    })
  }

  async adminClosePosition(positionId: string) {
    const position = await this.prisma.position.findFirst({
      where: { id: positionId, status: PositionStatus.OPEN },
    })

    if (!position) {
      throw new NotFoundException('Open position not found')
    }

    return this.closePosition(positionId, position.brokerId)
  }

  async getPositions(brokerId: string, status?: PositionStatus) {
    return this.prisma.position.findMany({
      where: {
        brokerId,
        ...(status ? { status } : {}),
      },
      include: {
        symbol: { select: { name: true, displayName: true, contractSize: true, digits: true, rawSpread: true } },
        client: { select: { firstName: true, lastName: true, email: true } },
        order: { select: { lpRawSpread: true, spreadMarkupApplied: true } },
      },
      orderBy: { openedAt: 'desc' },
    })
  }

  async getOrders(brokerId: string, query: PaginationQueryInput) {
    const page  = query.page  ?? 1
    const limit = query.limit ?? 20
    const skip  = (page - 1) * limit

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { brokerId },
        skip,
        take: limit,
        include: {
          symbol: { select: { name: true, displayName: true } },
          client: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where: { brokerId } }),
    ])

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getOrCreateMasterHouseClient(brokerId: string, companyName?: string, email?: string) {
    let client = await this.prisma.tradingClient.findFirst({
      where: { brokerId, externalClientId: 'ABOOK_MASTER' },
    })
    if (!client) {
      client = await this.prisma.tradingClient.create({
        data: {
          brokerId,
          externalClientId: 'ABOOK_MASTER',
          firstName: companyName || 'Broker',
          lastName: 'Master Account',
          email: email || `broker_${brokerId.slice(0, 8)}@lp.internal`,
          accountType: 'standard',
          leverage: 100,
          currency: 'USD',
          isActive: true,
        },
      })
    }
    return client
  }

  async getOrCreateDefaultExecutionAccount(brokerId: string, companyName?: string) {
    const execAccount = await this.prisma.executionAccount.create({
      data: {
        accountName: `${companyName || 'Broker'} Mock Execution Account`,
        provider: 'MOCK',
        accountNumber: `MOCK-${brokerId.slice(0, 8).toUpperCase()}`,
        serverAddress: 'localhost:mock',
        credentials: { mode: 'paper' },
        status: 'active',
        maxExposure: '1000000.00',
      },
    })

    return execAccount
  }

  private async computeChargeableLots(
    tx: Prisma.TransactionClient,
    brokerId: string,
    newLots: Prisma.Decimal,
    threshold: Prisma.Decimal,
    billingMonth: string,
  ): Promise<{ chargeableLots: Prisma.Decimal; freeLotsConsumed: Prisma.Decimal }> {
    if (threshold.lte(0)) {
      return { chargeableLots: newLots, freeLotsConsumed: new Prisma.Decimal(0) }
    }

    const ledger = await (tx as any).brokerCommissionLedger.findUnique({
      where: { brokerId_billingMonth: { brokerId, billingMonth } },
      select: { totalLotsTraded: true } as any,
    })

    const lotsAlready = new Prisma.Decimal(String(ledger?.totalLotsTraded ?? 0))
    const lotsAfter = lotsAlready.plus(newLots)

    if (lotsAlready.gte(threshold)) {
      // Already past threshold -> full order is chargeable
      return { chargeableLots: newLots, freeLotsConsumed: new Prisma.Decimal(0) }
    }

    if (lotsAfter.lte(threshold)) {
      // Entire order is within free tier
      return { chargeableLots: new Prisma.Decimal(0), freeLotsConsumed: newLots }
    }

    // Order straddles the threshold - proportional split
    const freeRemaining = threshold.minus(lotsAlready)
    const chargeable = lotsAfter.minus(threshold)
    return { chargeableLots: chargeable, freeLotsConsumed: freeRemaining }
  }
}
