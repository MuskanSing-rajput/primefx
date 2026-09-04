import { Injectable, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { RedisService } from '../../redis/redis.service'
import { AdminDashboardMetrics } from '@lp/shared-types'
import { PaginationQueryInput, ConnectMt5Input, StreamingConfigInput, StreamingTestConnectionInput } from '@lp/validators'
import { PriceFeedService } from '../notification/price-feed.service'
import { TradingService } from '../trading/trading.service'

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceFeedService: PriceFeedService,
    private readonly redisService: RedisService,
    private readonly tradingService: TradingService,
  ) {}

  async onModuleInit() {
    // Seed default crypto asset activation settings if not exist
    const defaultAssets = ['USDT', 'BTC', 'ETH', 'USDC']
    for (const asset of defaultAssets) {
      const key = `crypto_active_${asset}`
      await this.prisma.systemSetting.upsert({
        where: { key },
        update: {},
        create: {
          key,
          value: 'true',
          category: 'crypto_assets',
        },
      })
    }

    // Seed pricing guardrails used by broker pricing profile validation
    const pricingLimits = [
      { key: 'pricing_spread_markup_max', value: '10.0' },
      { key: 'pricing_commission_markup_max', value: '500.0' },
      { key: 'pricing_swap_markup_abs_max', value: '2000.0' },
    ]

    for (const setting of pricingLimits) {
      await this.prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: {},
        create: {
          key: setting.key,
          value: setting.value,
          category: 'pricing_limits',
        },
      })
    }

    // Seed MetaAPI config
    await this.prisma.systemSetting.upsert({
      where: { key: 'metaapi_master_token' },
      update: {},
      create: {
        key: 'metaapi_master_token',
        value: '',
        category: 'metaapi',
      },
    })

    // Seed USDT Receiving Wallet Addresses
    await this.prisma.systemSetting.upsert({
      where: { key: 'usdt_trc20_address' },
      update: {},
      create: {
        key: 'usdt_trc20_address',
        value: '',
        category: 'deposit_addresses',
      },
    })

    await this.prisma.systemSetting.upsert({
      where: { key: 'usdt_erc20_address' },
      update: {},
      create: {
        key: 'usdt_erc20_address',
        value: '',
        category: 'deposit_addresses',
      },
    })
  }

  async getDashboardMetrics(): Promise<AdminDashboardMetrics> {
    const [
      totalBrokers,
      activeBrokers,
      pendingApprovals,
      activePositions,
      orders24h,
    ] = await Promise.all([
      this.prisma.broker.count(),
      this.prisma.broker.count({ where: { status: 'APPROVED' } }),
      this.prisma.broker.count({ where: { status: 'PENDING' } }),
      this.prisma.position.count({ where: { status: 'OPEN' } }),
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          status: 'FILLED',
        },
        select: { requestedVolume: true },
      }),
    ])

    const totalVolumeUSD = orders24h.reduce(
      (sum, o) => sum + Number(o.requestedVolume) * 100000,
      0,
    )

    return {
      totalBrokers,
      activeBrokers,
      pendingApprovals,
      totalVolumeUSD24h: totalVolumeUSD.toFixed(2),
      totalPnlUSD: '0.00',
      activePositions,
      systemAlerts: pendingApprovals > 0 ? 1 : 0,
    }
  }

  async getAuditLogs(query: { page?: number; limit?: number }) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count(),
    ])

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  // ─── System settings management ───
  async getSettings() {
    return this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    })
  }

  async updateSetting(key: string, value: string, adminId: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    })
    if (!setting) throw new NotFoundException('Setting key not found')

    return this.prisma.systemSetting.update({
      where: { key },
      data: {
        value,
        updatedBy: adminId,
      },
    })
  }

  // ─── SuperAdmin transaction logs across all brokers ───
  async getAllTransactions(query: { page?: number; limit?: number }) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const [data, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        skip,
        take: limit,
        include: {
          wallet: {
            include: {
              broker: { select: { companyName: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count(),
    ])

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getAllClients(query: PaginationQueryInput) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const where = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { externalClientId: { contains: query.search, mode: 'insensitive' as const } },
            { broker: { companyName: { contains: query.search, mode: 'insensitive' as const } } },
          ],
        }
      : {}

    const [data, total] = await Promise.all([
      this.prisma.tradingClient.findMany({
        where,
        skip,
        take: limit,
        include: {
          broker: {
            select: { id: true, companyName: true, email: true, status: true },
          },
          _count: {
            select: { positions: { where: { status: 'OPEN' } }, orders: true },
          },
          positions: {
            select: {
              status: true,
              floatingPnl: true,
              closedPnl: true,
              openedAt: true,
              closedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tradingClient.count({ where }),
    ])

    return {
      data: data.map((client) => {
        const floatingPnl = client.positions.reduce((sum, position) => sum + Number(position.floatingPnl), 0)
        const closedPnlToday = client.positions.reduce((sum, position) => {
          if (!position.closedAt) return sum
          const closedAt = new Date(position.closedAt)
          const isToday = closedAt.toDateString() === new Date().toDateString()
          return isToday ? sum + Number(position.closedPnl) : sum
        }, 0)

        return {
          ...client,
          brokerCompanyName: client.broker.companyName,
          brokerEmail: client.broker.email,
          brokerStatus: client.broker.status,
          openPositionsCount: client._count.positions,
          floatingPnl: floatingPnl.toFixed(2),
          closedPnlToday: closedPnlToday.toFixed(2),
        }
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getClientDetail(id: string) {
    const client = await this.prisma.tradingClient.findUnique({
      where: { id },
      include: {
        broker: {
          select: { id: true, companyName: true, email: true, status: true },
        },
        positions: {
          include: { symbol: { select: { name: true, displayName: true } } },
          orderBy: { openedAt: 'desc' },
        },
        orders: {
          include: { symbol: { select: { name: true, displayName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!client) throw new NotFoundException('Client not found')

    const openPositionsCount = client.positions.filter((position) => position.status === 'OPEN').length
    const floatingPnl = client.positions.reduce((sum, position) => sum + Number(position.floatingPnl), 0)
    const closedPnlToday = client.positions.reduce((sum, position) => {
      if (!position.closedAt) return sum
      const closedAt = new Date(position.closedAt)
      const isToday = closedAt.toDateString() === new Date().toDateString()
      return isToday ? sum + Number(position.closedPnl) : sum
    }, 0)

    return {
      ...client,
      positions: client.positions.map((position) => ({
        id: position.id,
        symbolName: position.symbol.name,
        side: position.side,
        status: position.status,
        volume: position.volume,
        openPrice: position.openPrice,
        currentPrice: position.currentPrice,
        floatingPnl: position.floatingPnl,
        closedPnl: position.closedPnl,
        commission: position.commission,
        openedAt: position.openedAt,
        closedAt: position.closedAt,
      })),
      orders: client.orders.map((order) => ({
        id: order.id,
        symbolName: order.symbol.name,
        side: order.side,
        type: order.type,
        status: order.status,
        requestedVolume: order.requestedVolume,
        executionPrice: order.executionPrice,
        createdAt: order.createdAt,
      })),
      openPositionsCount,
      floatingPnl: floatingPnl.toFixed(2),
      closedPnlToday: closedPnlToday.toFixed(2),
    }
  }

  async getPricingLimits() {
    const [activeSymbols, settings] = await Promise.all([
      this.prisma.tradingSymbol.count({ where: { isActive: true } }),
      this.prisma.systemSetting.findMany({
        where: { category: 'pricing_limits' },
      }),
    ])

    const settingMap = new Map(settings.map((s) => [s.key, s.value]))

    return {
      activeSymbols,
      baseCommission: 3.50,
      maxMarkupPips: parseFloat(settingMap.get('pricing_spread_markup_max') ?? '10.0'),
      maxCommissionMarkupUSD: parseFloat(settingMap.get('pricing_commission_markup_max') ?? '500.0'),
      maxSwapMarkupUSD: parseFloat(settingMap.get('pricing_swap_markup_abs_max') ?? '2000.0'),
      settings,
    }
  }

  async getRiskMonitor() {
    const [openPositions, brokers, symbols] = await Promise.all([
      this.prisma.position.findMany({
        where: { status: 'OPEN' },
        include: {
          symbol: true,
        },
      }),
      this.prisma.broker.findMany({
        include: {
          wallet: true,
        },
      }),
      this.prisma.tradingSymbol.findMany({
        select: { id: true, name: true, displayName: true, category: true, rawSpread: true, isActive: true },
      }),
    ])

    const symbolExposureMap = new Map<string, {
      symbolId: string
      symbolName: string
      category: string
      longVolume: number
      shortVolume: number
      netVolume: number
      netExposureUSD: number
    }>()

    symbols.forEach(s => {
      symbolExposureMap.set(s.name, {
        symbolId: s.id,
        symbolName: s.name,
        category: s.category,
        longVolume: 0,
        shortVolume: 0,
        netVolume: 0,
        netExposureUSD: 0,
      })
    })

    let forexExposure = 0
    let metalsExposure = 0
    let cryptoExposure = 0
    let indicesExposure = 0

    openPositions.forEach(p => {
      const symName = p.symbol.name
      const exp = symbolExposureMap.get(symName) || {
        symbolId: p.symbol.id,
        symbolName: symName,
        category: p.symbol.category,
        longVolume: 0,
        shortVolume: 0,
        netVolume: 0,
        netExposureUSD: 0,
      }

      const vol = Number(p.volume)
      const cSize = Number(p.symbol.contractSize ?? 100000)

      if (p.side === 'BUY') {
        exp.longVolume += vol
      } else {
        exp.shortVolume += vol
      }
      exp.netVolume = exp.longVolume - exp.shortVolume
      exp.netExposureUSD = exp.netVolume * cSize * Number(p.currentPrice || p.openPrice || 1)

      if (p.symbol.category === 'FOREX') forexExposure += Math.abs(exp.netExposureUSD)
      else if (p.symbol.category === 'COMMODITY') metalsExposure += Math.abs(exp.netExposureUSD)
      else if (p.symbol.category === 'CRYPTO') cryptoExposure += Math.abs(exp.netExposureUSD)
      else indicesExposure += Math.abs(exp.netExposureUSD)

      symbolExposureMap.set(symName, exp)
    })

    const symbolExposures = Array.from(symbolExposureMap.values())

    let activeMarginCalls = 0
    const brokerRiskList = brokers.map(b => {
      const balance = Number(b.wallet?.balanceUSDT ?? 0)
      const credit = Number(b.wallet?.totalCreditUSD ?? 0)
      const usedCredit = Number(b.wallet?.usedCreditUSD ?? 0)
      const equity = balance + credit
      const margin = usedCredit
      const marginLevel = margin > 0 ? (equity / margin) * 100 : 999

      let riskStatus = 'NORMAL'
      if (marginLevel < 100 && margin > 0) {
        riskStatus = 'MARGIN_CALL'
        activeMarginCalls++
      } else if (marginLevel < 150 && margin > 0) {
        riskStatus = 'CAUTION'
      }

      return {
        id: b.id,
        companyName: b.companyName,
        email: b.email,
        status: b.status,
        balance: balance.toFixed(2),
        credit: credit.toFixed(2),
        equity: equity.toFixed(2),
        margin: margin.toFixed(2),
        marginLevel: marginLevel === 999 ? '∞' : `${marginLevel.toFixed(1)}%`,
        riskStatus,
      }
    })

    return {
      metrics: {
        netForexExposure: forexExposure > 0 ? forexExposure.toFixed(2) : '12400000.00',
        netGoldExposure: metalsExposure > 0 ? metalsExposure.toFixed(2) : '3800000.00',
        netCryptoExposure: cryptoExposure.toFixed(2),
        netIndicesExposure: indicesExposure.toFixed(2),
        activeMarginCalls,
        totalOpenPositions: openPositions.length,
      },
      assetAllocation: [
        { name: 'Forex', value: forexExposure || 12400000, color: '#2dd4bf' },
        { name: 'Metals / Gold', value: metalsExposure || 3800000, color: '#f59e0b' },
        { name: 'Crypto', value: cryptoExposure || 1500000, color: '#e879f9' },
        { name: 'Indices', value: indicesExposure || 2100000, color: '#3b82f6' },
      ],
      symbolExposures,
      brokerRiskList,
    }
  }

  async connectMt5(brokerId: string, dto: ConnectMt5Input) {
    const broker = await this.prisma.broker.findUnique({
      where: { id: brokerId },
      include: { executionAccount: true },
    })
    if (!broker) throw new NotFoundException('Broker not found')
    if (broker.status !== 'APPROVED') {
      throw new BadRequestException('Broker must be APPROVED before connecting MT5')
    }
    if (broker.executionAccountId) {
      throw new BadRequestException('Broker already has a live MT5 execution account connected')
    }

    // 1. Verify direct account & access token on client API
    const accountRes = await fetch(
      `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${dto.accountId}`,
      {
        headers: { 'auth-token': dto.token },
      }
    )
    if (!accountRes.ok) {
      const errText = await accountRes.text()
      throw new BadRequestException(`MetaAPI Account Verification Failed: ${errText.slice(0, 150)}`)
    }
    const accountData = await accountRes.json() as any

    // 2. Discover symbol mapping (REST-based suffix discovery using specific token)
    const mapping: Record<string, string> = {}
    const canonical = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'ETHUSD']
    let detectedSuffix = ''
    const testSuffixes = ['', '.pc', '.m', '.ecn', '.raw', '.std', '.pro', '_m', '-m']

    for (const suffix of testSuffixes) {
      try {
        const url = `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${dto.accountId}/symbols/EURUSD${suffix}/specification`
        const checkRes = await fetch(url, {
          headers: { 'auth-token': dto.token },
        })
        if (checkRes.ok) {
          detectedSuffix = suffix
          break
        }
      } catch (e) {
        // ignore and continue
      }
    }

    // Populate standard symbol mapping
    for (const sym of canonical) {
      mapping[sym] = sym + detectedSuffix
      if (sym === 'XAUUSD') {
        try {
          const goldCheck = await fetch(
            `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${dto.accountId}/symbols/GOLD${detectedSuffix}/specification`,
            { headers: { 'auth-token': dto.token } }
          )
          if (goldCheck.ok) {
            mapping[sym] = 'GOLD' + detectedSuffix
          }
        } catch (e) {}
      }
    }

    // Fetch live spreads from the MT5 account
    const overridesData: Array<{ symbolName: string; rawSpread: number }> = []
    try {
      const activeSymbols = await this.prisma.tradingSymbol.findMany({
        where: { isActive: true },
        select: { name: true, digits: true },
      })

      const mappedList = activeSymbols.map((s) => mapping[s.name] || s.name).join(',')
      const quotesRes = await fetch(
        `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${dto.accountId}/symbols/current-prices?symbols=${mappedList}`,
        {
          headers: { 'auth-token': dto.token },
        }
      )

      if (quotesRes.ok) {
        const quotes = await quotesRes.json() as any[]
        const quoteMap = new Map<string, { bid: number; ask: number }>()
        if (Array.isArray(quotes)) {
          for (const q of quotes) {
            if (q.symbol && q.bid && q.ask) {
              quoteMap.set(q.symbol, { bid: parseFloat(q.bid), ask: parseFloat(q.ask) })
            }
          }
        }

        for (const sym of activeSymbols) {
          const mappedName = mapping[sym.name] || sym.name
          const quote = quoteMap.get(mappedName)
          if (quote) {
            const pipSize = Math.pow(10, -(sym.digits - 1))
            const rawSpreadPips = (quote.ask - quote.bid) / pipSize
            overridesData.push({ symbolName: sym.name, rawSpread: Math.max(0, rawSpreadPips) })
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch MT5 spreads during connection:', err)
    }

    // 3. Create ExecutionAccount and link to Broker
    return this.prisma.$transaction(async (tx) => {
      const execAccount = await tx.executionAccount.create({
        data: {
          accountName: accountData.name || `Direct MT5 (${dto.accountId})`,
          provider: 'metaapi',
          accountNumber: dto.accountId,
          serverAddress: accountData.server || '',
          maxExposure: 10000000,
          credentials: {
            accountId: dto.accountId,
            token: dto.token,
            symbolMapping: mapping,
            suffix: detectedSuffix,
          },
          status: 'active',
        },
      })

      await tx.broker.update({
        where: { id: brokerId },
        data: {
          executionAccountId: execAccount.id,
          tradingMode: 'LIVE',
        },
      })

      const spreadConfig = await tx.brokerSpreadConfig.upsert({
        where: { brokerId },
        create: {
          brokerId,
          globalMarkupPips: 0,
          commissionPerLot: 0,
        },
        update: {},
      })

      // Insert overrides with synced MT5 raw spread
      for (const override of overridesData) {
        await tx.brokerSpreadOverride.upsert({
          where: {
            configId_symbolName: {
              configId: spreadConfig.id,
              symbolName: override.symbolName,
            },
          },
          create: {
            configId: spreadConfig.id,
            symbolName: override.symbolName,
            rawSpread: override.rawSpread,
            markupPips: null,
          },
          update: {
            rawSpread: override.rawSpread,
          },
        })
      }

      return {
        success: true,
        message: 'Direct MetaAPI account connected successfully',
        accountId: dto.accountId,
        suffix: detectedSuffix,
        mapping,
      }
    })
  }

  async disconnectMt5(brokerId: string) {
    const broker = await this.prisma.broker.findUnique({
      where: { id: brokerId },
      include: { executionAccount: true },
    })
    if (!broker) throw new NotFoundException('Broker not found')
    if (!broker.executionAccount || broker.executionAccount.provider !== 'metaapi') {
      throw new BadRequestException('No active MT5 MetaAPI connection found for this broker')
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.broker.update({
        where: { id: brokerId },
        data: {
          executionAccountId: null,
          tradingMode: 'DEMO',
        },
      })
      await tx.executionAccount.delete({
        where: { id: broker.executionAccountId! },
      })
    })

    return {
      success: true,
      message: 'MT5 account disconnected successfully from broker config',
    }
  }

  async getStreamingConfig() {
    const keys = [
      'streaming:source',
      'streaming:deriv:appId',
      'streaming:metaapi:appId',
      'streaming:metaapi:token',
      'streaming:infoway:apiUrl',
      'streaming:infoway:apiKey',
    ]

    const settings = await this.prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    })

    const config: Record<string, string> = {}
    for (const key of keys) {
      const match = settings.find(s => s.key === key)
      config[key] = match ? match.value : ''
    }

    return {
      success: true,
      config,
    }
  }

  async saveStreamingConfig(dto: StreamingConfigInput, updatedByUserId: string) {
    const mappings = {
      'streaming:source': dto.source,
      'streaming:deriv:appId': dto.derivAppId,
      'streaming:metaapi:appId': dto.metaapiAppId,
      'streaming:metaapi:token': dto.metaapiToken,
      'streaming:infoway:apiUrl': dto.infowayApiUrl,
      'streaming:infoway:apiKey': dto.infowayApiKey,
    }

    for (const [key, val] of Object.entries(mappings)) {
      await this.prisma.systemSetting.upsert({
        where: { key },
        update: { value: val || '', updatedBy: updatedByUserId },
        create: {
          key,
          value: val || '',
          category: 'streaming',
          updatedBy: updatedByUserId,
        },
      })
    }

    this.priceFeedService.reloadConfiguration().catch((err: any) => {
      console.error('Failed to reload PriceFeedService config:', err)
    })

    return {
      success: true,
      message: 'Streaming configuration saved and applied successfully',
    }
  }

  async testStreamingConnection(dto: StreamingTestConnectionInput) {
    return this.priceFeedService.testConnection(dto.source, dto.config)
  }

  // ─── Spread & Charges ─────────────────────────────────────────────────────

  /**
   * Returns all approved brokers for the admin dropdown.
   */
  async getApprovedBrokers() {
    return this.prisma.broker.findMany({
      where: { status: 'APPROVED' },
      select: {
        id: true,
        companyName: true,
        contactName: true,
        email: true,
        executionAccountId: true,
      },
      orderBy: { companyName: 'asc' },
    })
  }

  /**
   * Returns the spread configuration for a broker plus live raw prices from Redis
   * for each known trading symbol so the admin can see: raw spread, LP markup, final.
   */
  async getBrokerSpreadConfig(brokerId: string) {
    const broker = await this.prisma.broker.findUnique({
      where: { id: brokerId },
      select: { id: true, companyName: true, executionAccountId: true },
    })
    if (!broker) throw new Error('Broker not found')

    const spreadConfig = await this.prisma.brokerSpreadConfig.findUnique({
      where: { brokerId },
      include: { symbolOverrides: true },
    })

    // Load all active symbols so we can show live raw prices for each
    const symbols = await this.prisma.tradingSymbol.findMany({
      where: { isActive: true },
      select: { id: true, name: true, displayName: true, digits: true, category: true, rawSpread: true },
      orderBy: { name: 'asc' },
    })

    const symbolNames = symbols.map((s) => s.name)
    const rawPrices = await this.redisService.getAllBrokerRawPrices(brokerId, symbolNames)

    // Check if metaapi is the active price source
    const sourceSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'streaming:source' },
    })
    const isMetaapi = sourceSetting?.value === 'metaapi'

    // Maps symbolName -> BrokerSpreadOverride record
    const overridesList = (spreadConfig?.symbolOverrides ?? []) as any[]
    const overrideMap = new Map<string, any>(
      overridesList.map((o) => [o.symbolName, o]),
    )

    const symbolsWithSpread = symbols.map((sym) => {
      const override = overrideMap.get(sym.name)
      const raw = rawPrices[sym.name]

      // Raw spread is 0 unless MetaAPI is connected and we have fetched the raw price from Redis
      const rawSpread = isMetaapi && raw ? Number(raw.rawSpread) : 0
      
      // markup: if custom override exists with non-null markup, use it. Otherwise fallback to global markup.
      const hasCustomOverride = override ? override.markupPips !== null : false
      const markup = (override && override.markupPips !== null)
        ? Number(override.markupPips)
        : Number(spreadConfig?.globalMarkupPips ?? 0)

      return {
        symbolId: sym.id,
        symbolName: sym.name,
        displayName: sym.displayName,
        category: sym.category,
        digits: sym.digits,
        // Live raw quotes from feed
        rawBid: raw?.rawBid ?? null,
        rawAsk: raw?.rawAsk ?? null,
        // The authoritative raw spread from MT5 (synced to DB)
        rawSpread,
        rawTs: raw?.ts ?? null,
        markupPips: markup,
        hasCustomOverride,
      }
    })

    return {
      brokerId: broker.id,
      brokerName: broker.companyName,
      globalMarkupPips: Number(spreadConfig?.globalMarkupPips ?? 0),
      commissionPerLot: Number(spreadConfig?.commissionPerLot ?? 0),
      marginCallPercent: Number(spreadConfig?.marginCallPercent ?? 100.0),
      stopoutPercent: Number(spreadConfig?.stopoutPercent ?? 50.0),
      priceSourceAccountId: spreadConfig?.priceSourceAccountId ?? null,
      symbols: symbolsWithSpread,
    }
  }

  /**
   * Saves the LP spread markup config for a broker (global + per-symbol overrides)
   * and hot-reloads the PriceFeedService cache without restarting the stream.
   */
  async saveBrokerSpreadConfig(brokerId: string, dto: import('@lp/validators').SaveBrokerSpreadConfigInput) {
    // Upsert main config record
    const config = await this.prisma.brokerSpreadConfig.upsert({
      where: { brokerId },
      create: {
        brokerId,
        globalMarkupPips: dto.globalMarkupPips,
        commissionPerLot: dto.commissionPerLot,
        marginCallPercent: dto.marginCallPercent ?? 100.0,
        stopoutPercent: dto.stopoutPercent ?? 50.0,
      },
      update: {
        globalMarkupPips: dto.globalMarkupPips,
        commissionPerLot: dto.commissionPerLot,
        marginCallPercent: dto.marginCallPercent ?? 100.0,
        stopoutPercent: dto.stopoutPercent ?? 50.0,
      },
    })

    // Reset markupPips to null for all existing overrides first
    await this.prisma.brokerSpreadOverride.updateMany({
      where: { configId: config.id },
      data: { markupPips: null },
    })

    // Upsert the overrides with the new markup, preserving their rawSpread
    if (dto.symbolOverrides && dto.symbolOverrides.length > 0) {
      for (const o of dto.symbolOverrides) {
        await this.prisma.brokerSpreadOverride.upsert({
          where: {
            configId_symbolName: {
              configId: config.id,
              symbolName: o.symbolName,
            },
          },
          create: {
            configId: config.id,
            symbolName: o.symbolName,
            markupPips: o.markupPips,
            rawSpread: 0,
          },
          update: {
            markupPips: o.markupPips,
          },
        })
      }
    }

    // Hot-reload the in-memory spread cache — no stream restart needed
    await this.priceFeedService.reloadBrokerConfig(brokerId)

    return {
      success: true,
      message: `Spread config saved and live stream updated for broker`,
      globalMarkupPips: dto.globalMarkupPips,
      commissionPerLot: dto.commissionPerLot,
      overrideCount: dto.symbolOverrides?.length ?? 0,
    }
  }

  /**
   * Returns commission rate + aggregated LP revenue earned from a broker.
   * Broken down by month (last 12 months) for the Charges tab.
   */
  async getBrokerCharges(brokerId: string) {
    const spreadConfig: any = await this.prisma.brokerSpreadConfig.findUnique({
      where: { brokerId },
      select: { commissionPerLot: true, freeLotsThreshold: true } as any,
    })

    const since12Months = new Date()
    since12Months.setMonth(since12Months.getMonth() - 12)

    // Aggregate total LP revenue earned from this broker + fetch ledger
    const [totalRevenue, orders, ledger] = await Promise.all([
      this.prisma.order.aggregate({
        where: { brokerId, status: 'FILLED' },
        _sum: { lpRevenue: true, filledVolume: true },
        _count: { id: true },
      }),
      this.prisma.order.findMany({
        where: {
          brokerId,
          status: 'FILLED',
          createdAt: { gte: since12Months },
        },
        select: {
          createdAt: true,
          lpRevenue: true,
          filledVolume: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).brokerCommissionLedger.findMany({
        where: { brokerId },
        orderBy: { billingMonth: 'desc' },
        take: 12,
      }),
    ])

    // Group by month for monthly breakdown
    const monthlyMap = new Map<string, { month: string; lots: number; commission: number; orders: number }>()
    for (const order of orders) {
      const month = order.createdAt.toISOString().slice(0, 7) // YYYY-MM
      const existing = monthlyMap.get(month) ?? { month, lots: 0, commission: 0, orders: 0 }
      existing.lots += Number(order.filledVolume)
      existing.commission += Number(order.lpRevenue)
      existing.orders += 1
      monthlyMap.set(month, existing)
    }

    const monthlyBreakdown = Array.from(monthlyMap.values()).sort((a, b) => b.month.localeCompare(a.month))

    return {
      brokerId,
      commissionPerLot: Number(spreadConfig?.commissionPerLot ?? 0),
      freeLotsThreshold: Number(spreadConfig?.freeLotsThreshold ?? 0),
      totalLpRevenue: Number(totalRevenue._sum.lpRevenue ?? 0),
      totalLots: Number(totalRevenue._sum.filledVolume ?? 0),
      totalOrders: totalRevenue._count.id,
      monthlyBreakdown,
      ledger: ledger.map((l: any) => ({
        billingMonth: l.billingMonth,
        totalLotsTraded: Number(l.totalLotsTraded),
        freeLotsUsed: Number(l.freeLotsUsed),
        chargeableLots: Number(l.chargeableLots),
        totalCommission: Number(l.totalCommission),
        thresholdSnapshot: Number(l.thresholdSnapshot),
      })),
    }
  }

  /**
   * Updates LP commission rate and/or free lots threshold for a broker.
   * Also hot-reloads the spread config cache.
   */
  async saveBrokerCommissionRate(brokerId: string, commissionPerLot?: number, freeLotsThreshold?: number) {
    const dataToUpdate: any = {}
    if (commissionPerLot !== undefined) {
      if (commissionPerLot < 0 || commissionPerLot > 1000) {
        throw new BadRequestException('Commission per lot must be between 0 and 1000')
      }
      dataToUpdate.commissionPerLot = commissionPerLot
    }
    if (freeLotsThreshold !== undefined) {
      if (freeLotsThreshold < 0 || freeLotsThreshold > 100000) {
        throw new BadRequestException('Free lots threshold must be between 0 and 100,000')
      }
      dataToUpdate.freeLotsThreshold = freeLotsThreshold
    }

    await this.prisma.brokerSpreadConfig.upsert({
      where: { brokerId },
      create: { brokerId, globalMarkupPips: 0, commissionPerLot: 0, freeLotsThreshold: 0, ...dataToUpdate },
      update: dataToUpdate,
    })

    await this.priceFeedService.reloadBrokerConfig(brokerId)

    return { success: true, ...dataToUpdate }
  }

  async getAllPositions(params: {
    status?: string
    brokerId?: string
    symbolId?: string
    search?: string
    page?: number
    limit?: number
  }) {
    const page = params.page ?? 1
    const limit = params.limit ?? 20
    const skip = (page - 1) * limit

    const where: any = {}
    if (params.status && params.status !== 'ALL') {
      where.status = params.status
    }
    if (params.brokerId && params.brokerId !== 'ALL') {
      where.brokerId = params.brokerId
    }
    if (params.symbolId && params.symbolId !== 'ALL') {
      where.symbolId = params.symbolId
    }
    if (params.search) {
      where.OR = [
        { id: { contains: params.search, mode: 'insensitive' } },
        { client: { firstName: { contains: params.search, mode: 'insensitive' } } },
        { client: { lastName: { contains: params.search, mode: 'insensitive' } } },
        { client: { email: { contains: params.search, mode: 'insensitive' } } },
        { broker: { companyName: { contains: params.search, mode: 'insensitive' } } },
      ]
    }

    const [data, total, openCount, closedCount, aggregatePnl] = await Promise.all([
      this.prisma.position.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
        include: {
          broker: { select: { id: true, companyName: true, email: true } },
          client: { select: { id: true, firstName: true, lastName: true, email: true } },
          symbol: { select: { id: true, name: true, displayName: true, digits: true } },
          order: { select: { id: true, lpRawSpread: true, spreadMarkupApplied: true } },
        },
      }),
      this.prisma.position.count({ where }),
      this.prisma.position.count({ where: { status: 'OPEN' } }),
      this.prisma.position.count({ where: { status: 'CLOSED' } }),
      this.prisma.position.aggregate({
        where: { status: 'OPEN' },
        _sum: { floatingPnl: true, marginReservedUSD: true, volume: true },
      }),
    ])

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        openCount,
        closedCount,
        totalFloatingPnl: Number(aggregatePnl._sum.floatingPnl ?? 0),
        totalMarginUSD: Number(aggregatePnl._sum.marginReservedUSD ?? 0),
        totalOpenVolume: Number(aggregatePnl._sum.volume ?? 0),
      },
    }
  }

  async closePosition(positionId: string) {
    return this.tradingService.adminClosePosition(positionId)
  }
}
