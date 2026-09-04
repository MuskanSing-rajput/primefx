import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import * as https from 'https'
import { Prisma } from '@prisma/client'
import { NotificationGateway } from './notification.gateway'
import { RedisService } from '../../redis/redis.service'
import { PrismaService } from '../../database/prisma.service'
import { TradingService } from '../trading/trading.service'

// ─── Symbol Config ──────────────────────────────────────────────────────────
interface SymbolCfg {
  digits: number
  halfSpread: number // 0.1 pip = half of the 0.2 pip spread
  pipSize: number
  microWalkMax: number // max micro-tick delta per 500ms tick (fraction of pip)
}

// 0.2 pip total spread → halfSpread = 0.1 pip each side
const SYMBOLS: Record<string, SymbolCfg> = {
  // Forex
  EURUSD: { digits: 5, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.000008 },
  GBPUSD: { digits: 5, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.000010 },
  USDJPY: { digits: 3, pipSize: 0.01,    halfSpread: 0.001,    microWalkMax: 0.006    },
  AUDUSD: { digits: 5, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.000007 },
  NZDUSD: { digits: 5, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.000007 },
  EURNZD: { digits: 5, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.000015 },
  GBPNZD: { digits: 5, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.000018 },
  EURAUD: { digits: 5, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.000012 },
  GBPAUD: { digits: 5, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.000014 },
  AUDJPY: { digits: 3, pipSize: 0.01,    halfSpread: 0.001,    microWalkMax: 0.007    },
  GBPJPY: { digits: 3, pipSize: 0.01,    halfSpread: 0.001,    microWalkMax: 0.009    },
  CADJPY: { digits: 3, pipSize: 0.01,    halfSpread: 0.001,    microWalkMax: 0.007    },
  // Metals
  XAUUSD: { digits: 2, pipSize: 0.1,     halfSpread: 0.01,     microWalkMax: 0.08     },
  XAGUSD: { digits: 3, pipSize: 0.001,   halfSpread: 0.0001,   microWalkMax: 0.0005   },
  XAUEUR: { digits: 2, pipSize: 0.1,     halfSpread: 0.01,     microWalkMax: 0.08     },
  XAGAUD: { digits: 3, pipSize: 0.001,   halfSpread: 0.0001,   microWalkMax: 0.0005   },
  // Crypto
  BTCUSD: { digits: 2, pipSize: 1.0,     halfSpread: 0.1,      microWalkMax: 0.5      },
  ETHUSD: { digits: 2, pipSize: 0.1,     halfSpread: 0.01,     microWalkMax: 0.05     },
  LTCUSD: { digits: 2, pipSize: 0.01,    halfSpread: 0.001,    microWalkMax: 0.01     },
  XRPUSD: { digits: 4, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.00008  },
  UNIUSD: { digits: 4, pipSize: 0.0001,  halfSpread: 0.00001,  microWalkMax: 0.00008  },
}

const SEED_MID_PRICES: Record<string, number> = {
  EURUSD: 1.08500,
  GBPUSD: 1.28500,
  USDJPY: 155.000,
  AUDUSD: 0.65500,
  NZDUSD: 0.59500,
  EURNZD: 1.82350,
  GBPNZD: 2.15960,
  EURAUD: 1.65650,
  GBPAUD: 1.96180,
  AUDJPY: 101.525,
  GBPJPY: 199.175,
  CADJPY: 113.140,
  XAUUSD: 2420.50,
  XAGUSD: 28.500,
  XAUEUR: 2230.80,
  XAGAUD: 43.510,
  BTCUSD: 65000.00,
  ETHUSD: 3100.00,
  LTCUSD: 75.00,
  XRPUSD: 0.5500,
  UNIUSD: 7.5000,
}

export function isMarketOpen(symbol: string): boolean {
  if (!symbol) return true
  const cryptoSymbols = ['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'UNIUSD']
  const cleanSymbol = symbol.replace('/', '').toUpperCase()
  if (cryptoSymbols.some(c => cleanSymbol.includes(c))) {
    return true
  }

  const now = new Date()
  const day = now.getUTCDay() // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hour = now.getUTCHours()

  // Weekend closure: Friday 22:00 UTC to Sunday 22:00 UTC
  if (day === 5) { // Friday
    return hour < 22
  }
  if (day === 6) { // Saturday
    return false
  }
  if (day === 0) { // Sunday
    return hour >= 22
  }
  return true
}

@Injectable()
export class PriceFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriceFeedService.name)
  private destroyed = false

  // ─── Global raw mid prices (keyed by symbol) ──────────────────────────────
  // These are the raw prices coming from the feed (Binance/Deriv/etc) BEFORE
  // any LP markup is applied. Used as the source truth for per-broker pricing.
  private midPrices: Map<string, number> = new Map()

  // ─── Broker spread config cache ───────────────────────────────────────────
  // Loaded on startup and hot-reloaded on config save. Never hit the DB on
  // every tick. The structure is:
  //   Map<brokerId, { globalMarkupPips, commissionPerLot, overrides: Map<symbol, pips> }>
  private spreadConfigCache: Map<string, {
    globalMarkupPips: number
    commissionPerLot: number
    marginCallPercent: number
    stopoutPercent: number
    overrides: Map<string, { markupPips: number | null; rawSpread: number }>
  }> = new Map()

  // ─── Per-broker config reload lock ────────────────────────────────────────
  // Prevents a concurrent DB read + cache write race if two saves arrive fast.
  private configReloadLock: Map<string, boolean> = new Map()

  // USD exchange rates (USD = 1.0)
  private usdRates: Record<string, number> = {
    EUR: 0.92, GBP: 0.79, JPY: 155.0, AUD: 1.55, NZD: 1.70, CAD: 1.37,
  }

  private binanceWs: any = null
  private derivWs: any = null
  private fxPollTimer: NodeJS.Timeout | null = null
  private metalPollTimer: NodeJS.Timeout | null = null
  private microTickTimer: NodeJS.Timeout | null = null
  private positionTimer: NodeJS.Timeout | null = null
  private metaapiTimer: NodeJS.Timeout | null = null
  private infowayTimer: NodeJS.Timeout | null = null
  private derivPingTimer: NodeJS.Timeout | null = null
  private derivResubTimer: NodeJS.Timeout | null = null
  private activeSource: string = 'default'

  constructor(
    private readonly notificationGateway: NotificationGateway,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly tradingService: TradingService,
  ) {}

  async onModuleInit() {
    this.logger.log('🚀 Starting live price feed...')
    // Seed initial mid prices so all instruments immediately have valid quotes
    Object.entries(SEED_MID_PRICES).forEach(([sym, price]) => {
      if (!this.midPrices.has(sym)) {
        this.midPrices.set(sym, price)
        this.publishPrice(sym, price)
      }
    })

    this.startPositionUpdates()
    // Load per-broker spread configs into memory cache before starting the feed
    await this.loadAllBrokerSpreadConfigs()
    await this.reloadConfiguration()
  }

  onModuleDestroy() {
    this.destroyed = true
    this.stopAllStreams()
    if (this.positionTimer) clearInterval(this.positionTimer)
  }

  private stopAllStreams() {
    if (this.binanceWs) try { this.binanceWs.close() } catch {}
    this.binanceWs = null
    if (this.derivWs) try { this.derivWs.close() } catch {}
    this.derivWs = null
    if (this.fxPollTimer)    clearInterval(this.fxPollTimer)
    if (this.metalPollTimer) clearInterval(this.metalPollTimer)
    if (this.microTickTimer) clearInterval(this.microTickTimer)
    if (this.metaapiTimer)   clearInterval(this.metaapiTimer)
    if (this.infowayTimer)   clearInterval(this.infowayTimer)
    if (this.derivPingTimer) clearInterval(this.derivPingTimer)
    if (this.derivResubTimer) clearInterval(this.derivResubTimer)
    this.fxPollTimer = null
    this.metalPollTimer = null
    this.microTickTimer = null
    this.metaapiTimer = null
    this.infowayTimer = null
    this.derivPingTimer = null
    this.derivResubTimer = null
  }

  // ─── Publish raw mid → derive bid/ask → store in Redis + broadcast ────────
  //
  // Architecture:
  //   1. Store raw mid globally (for position PnL, admin dashboard)
  //   2. For each broker in spreadConfigCache:
  //      a. Resolve markup pips: override[symbol] ?? globalMarkupPips
  //      b. Compute half-markup = markupPips × pipSize / 2
  //      c. bid = rawMid - halfMarkup,  ask = rawMid + halfMarkup
  //      d. Write raw bid/ask to Redis  (raw:{brokerId}:{symbol})
  //      e. Write final bid/ask to Redis (price:{symbol}) — global, used by TradingService
  //      f. Broadcast broker-specific price to `broker:{brokerId}` WS room
  //   3. Also broadcast raw price to `price:{symbol}` room (for admin dashboard)
  //
  private publishPrice(symbol: string, rawMid: number) {
    const cfg = SYMBOLS[symbol]
    if (!cfg || !rawMid || rawMid <= 0) return

    // If market is closed and we already have a quote in cache, freeze it
    if (!isMarketOpen(symbol) && this.midPrices.has(symbol)) {
      return
    }

    this.midPrices.set(symbol, rawMid)

    // Raw bid/ask using ZERO markup — stored as the reference price
    // If MetaAPI is NOT connected, show raw bid/ask same as mid point (0 raw spread)
    const isMetaapi = this.activeSource === 'metaapi'
    const rawBid = isMetaapi ? rawMid - cfg.halfSpread : rawMid
    const rawAsk = isMetaapi ? rawMid + cfg.halfSpread : rawMid
    const rawBidStr = rawBid.toFixed(cfg.digits)
    const rawAskStr = rawAsk.toFixed(cfg.digits)

    // Store global reference price (used by TradingService.getFreshMarketQuote)
    this.redisService.setPrice(symbol, rawBidStr, rawAskStr).catch(() => {})

    // Broadcast to admin/global room
    this.notificationGateway.broadcastPriceUpdate(symbol, rawBidStr, rawAskStr)

    // ── Per-broker spread markup + broadcast ─────────────────────────────────
    this.spreadConfigCache.forEach((brokerCfg, brokerId) => {
      const override = brokerCfg.overrides.get(symbol)
      
      // raw spread: if metaapi is connected and override is present, use it. Otherwise if metaapi is not connected, raw spread is 0.
      const rawSpread = isMetaapi
        ? (override ? override.rawSpread : (cfg.halfSpread * 2) / cfg.pipSize)
        : 0
      
      // markup pips: use override markupPips (if not null), fallback to global fallback markup pips
      const markupPips = (override && override.markupPips !== null) ? override.markupPips : brokerCfg.globalMarkupPips
      
      const combinedSpread = rawSpread + markupPips
      const halfSpread = (combinedSpread * cfg.pipSize) / 2

      const bid = (rawMid - halfSpread).toFixed(cfg.digits)
      const ask = (rawMid + halfSpread).toFixed(cfg.digits)

      // Compute MT5 raw price as reference for the admin dashboard (so the admin can see their raw spread + LP markup = final price)
      const mt5RawBid = (rawMid - (rawSpread * cfg.pipSize) / 2).toFixed(cfg.digits)
      const mt5RawAsk = (rawMid + (rawSpread * cfg.pipSize) / 2).toFixed(cfg.digits)

      // Store raw reference for admin Spread & Charges page visibility
      this.redisService.setBrokerRawPrice(brokerId, symbol, mt5RawBid, mt5RawAsk).catch(() => {})

      // Broadcast markup-applied price to this broker's WS room
      this.notificationGateway.broadcastBrokerPrice(brokerId, symbol, bid, ask, mt5RawBid, mt5RawAsk, markupPips)
    })
  }

  // ─── Public: Hot-reload spread config for a single broker ─────────────────
  // Called by AdminService after saving spread config. Atomic: no stream restart.
  async reloadBrokerConfig(brokerId: string): Promise<void> {
    // Prevent concurrent reloads for same broker (e.g., rapid saves)
    if (this.configReloadLock.get(brokerId)) {
      this.logger.warn(`Spread config reload skipped for ${brokerId} — already in progress`)
      return
    }
    this.configReloadLock.set(brokerId, true)
    try {
      const record = await this.prisma.brokerSpreadConfig.findUnique({
        where: { brokerId },
        include: { symbolOverrides: true },
      })
      if (!record) {
        this.spreadConfigCache.delete(brokerId)
        return
      }
      const overrides = new Map<string, { markupPips: number | null; rawSpread: number }>()
      for (const o of record.symbolOverrides) {
        overrides.set(o.symbolName, {
          markupPips: o.markupPips !== null ? Number(o.markupPips) : null,
          rawSpread: Number(o.rawSpread),
        })
      }
      this.spreadConfigCache.set(brokerId, {
        globalMarkupPips: Number(record.globalMarkupPips),
        commissionPerLot: Number(record.commissionPerLot),
        marginCallPercent: Number(record.marginCallPercent),
        stopoutPercent: Number(record.stopoutPercent),
        overrides,
      })
      this.logger.log(`✅ Spread config reloaded for broker ${brokerId}: ${Number(record.globalMarkupPips)} pips global, ${overrides.size} overrides, MC: ${Number(record.marginCallPercent)}%, SO: ${Number(record.stopoutPercent)}%`)
    } finally {
      this.configReloadLock.delete(brokerId)
    }
  }

  // ─── Internal: Load all broker spread configs on startup ──────────────────
  private async loadAllBrokerSpreadConfigs(): Promise<void> {
    const configs = await this.prisma.brokerSpreadConfig.findMany({
      include: { symbolOverrides: true },
    })
    this.spreadConfigCache.clear()
    for (const record of configs) {
      const overrides = new Map<string, { markupPips: number | null; rawSpread: number }>()
      for (const o of record.symbolOverrides) {
        overrides.set(o.symbolName, {
          markupPips: o.markupPips !== null ? Number(o.markupPips) : null,
          rawSpread: Number(o.rawSpread),
        })
      }
      this.spreadConfigCache.set(record.brokerId, {
        globalMarkupPips: Number(record.globalMarkupPips),
        commissionPerLot: Number(record.commissionPerLot),
        marginCallPercent: Number(record.marginCallPercent),
        stopoutPercent: Number(record.stopoutPercent),
        overrides,
      })
    }
    this.logger.log(`📋 Loaded spread configs for ${this.spreadConfigCache.size} broker(s)`)
  }

  // ─── Micro-tick engine: generates realistic live price movement ────────────
  private startMicroTicks() {
    this.microTickTimer = setInterval(() => {
      this.midPrices.forEach((mid, symbol) => {
        const cfg = SYMBOLS[symbol]
        if (!cfg) return
        // For crypto — Binance WS handles updates, just re-publish
        if (['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'UNIUSD'].includes(symbol)) return
        // Apply tiny random walk within microWalkMax
        const delta = (Math.random() - 0.5) * 2 * cfg.microWalkMax
        const newMid = Math.max(0.0001, mid + delta)
        this.publishPrice(symbol, newMid)
      })
    }, 400) // 400ms tick interval for all non-crypto
  }

  // ─── Binance WebSocket (Real-time crypto) ────────────────────────────────
  private connectBinanceWs() {
    const WS = (globalThis as any).WebSocket
    if (!WS) {
      this.logger.warn('Native WebSocket not available, crypto prices will use micro-tick only')
      return
    }

    const streams = 'btcusdt@ticker/ethusdt@ticker/ltcusdt@ticker/xrpusdt@ticker/uniusdt@ticker'
    const url = `wss://stream.binance.com:9443/ws/${streams}`
    this.logger.log('Connecting to Binance WebSocket for crypto prices...')

    this.binanceWs = new WS(url)

    this.binanceWs.onopen = () => {
      this.logger.log('✅ Connected to Binance live crypto stream')
    }

    this.binanceWs.onmessage = (event: any) => {
      try {
        const d = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
        if (!d.s) return
        // Use raw Binance mid price (bid+ask)/2 — ignore Binance spread, apply our 0.2 pip
        const rawMid = d.b && d.a ? (parseFloat(d.b) + parseFloat(d.a)) / 2 : parseFloat(d.c)
        const symbolMap: Record<string, string> = {
          BTCUSDT: 'BTCUSD', ETHUSDT: 'ETHUSD', LTCUSDT: 'LTCUSD',
          XRPUSDT: 'XRPUSD', UNIUSDT: 'UNIUSD',
        }
        const platform = symbolMap[d.s]
        if (platform && !isNaN(rawMid) && rawMid > 0) {
          this.publishPrice(platform, rawMid)
        }
      } catch {}
    }

    this.binanceWs.onerror = () => {}

    this.binanceWs.onclose = () => {
      if (this.destroyed) return
      this.logger.warn('Binance WS closed. Reconnecting in 5s...')
      setTimeout(() => this.connectBinanceWs(), 5_000)
    }
  }

  // ─── ECB / Open Exchange Rates for Forex Rates (free, no key) ────────────
  private async fetchFxRates() {
    return new Promise<void>((resolve) => {
      https.get('https://open.er-api.com/v6/latest/USD', (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            const r = JSON.parse(data)
            if (r.rates) {
              this.usdRates = { ...this.usdRates, ...r.rates }
              this.logger.log('✅ Updated forex rates from Open Exchange Rates')
              // Recalculate all forex mid prices from fresh rates
              this.recalculateForexPrices()
            }
          } catch {}
          resolve()
        })
      }).on('error', () => { resolve() })
    })
  }

  private startFxPoll() {
    // Refresh base rates every 60 seconds
    this.fxPollTimer = setInterval(() => this.fetchFxRates(), 60_000)
  }

  private recalculateForexPrices() {
    const r = this.usdRates
    const eur = 1 / (r.EUR || 0.92)
    const gbp = 1 / (r.GBP || 0.79)
    const aud = 1 / (r.AUD || 1.55)
    const nzd = 1 / (r.NZD || 1.70)
    const jpy = r.JPY || 155.0
    const cad = r.CAD || 1.37

    // Major USD pairs
    this.publishPrice('EURUSD', eur)
    this.publishPrice('GBPUSD', gbp)
    this.publishPrice('AUDUSD', aud)
    this.publishPrice('NZDUSD', nzd)
    this.publishPrice('USDJPY', jpy)

    // Cross pairs (calculated)
    this.publishPrice('EURNZD', eur * (r.NZD || 1.70))
    this.publishPrice('GBPNZD', gbp * (r.NZD || 1.70))
    this.publishPrice('EURAUD', eur * (r.AUD || 1.55))
    this.publishPrice('GBPAUD', gbp * (r.AUD || 1.55))
    this.publishPrice('AUDJPY', aud * jpy)
    this.publishPrice('GBPJPY', gbp * jpy)
    this.publishPrice('CADJPY', (1 / cad) * jpy)
  }

  // ─── Yahoo Finance for Metals (free, no key required) ────────────────────
  private async fetchMetalPrices() {
    const fetchPrice = (symbol: string, ySymbol: string): Promise<number | null> =>
      new Promise((resolve) => {
        const url = `/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1m&range=1d`
        const opts = {
          hostname: 'query1.finance.yahoo.com',
          path: url,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }
        https.get(opts, (res) => {
          let data = ''
          res.on('data', (d) => { data += d })
          res.on('end', () => {
            try {
              const r = JSON.parse(data)
              const price = r?.chart?.result?.[0]?.meta?.regularMarketPrice
              resolve(price ? parseFloat(price) : null)
            } catch { resolve(null) }
          })
        }).on('error', () => resolve(null))
      })

    const [xauusd, xagusd] = await Promise.all([
      fetchPrice('XAUUSD', 'GC=F'),  // Gold futures
      fetchPrice('XAGUSD', 'SI=F'),  // Silver futures
    ])

    if (xauusd && xauusd > 0) {
      this.publishPrice('XAUUSD', xauusd)
      this.logger.log(`✅ XAUUSD = ${xauusd}`)
      // Derive XAUEUR
      const eurusd = this.midPrices.get('EURUSD')
      if (eurusd && eurusd > 0) {
        this.publishPrice('XAUEUR', xauusd / eurusd)
      }
    }

    if (xagusd && xagusd > 0) {
      this.publishPrice('XAGUSD', xagusd)
      this.logger.log(`✅ XAGUSD = ${xagusd}`)
      // Derive XAGAUD
      const audusd = this.midPrices.get('AUDUSD')
      if (audusd && audusd > 0) {
        this.publishPrice('XAGAUD', xagusd / audusd)
      }
    }
  }

  private startMetalPoll() {
    // Refresh metal prices every 10 seconds
    this.metalPollTimer = setInterval(() => this.fetchMetalPrices(), 10_000)
  }

  private startPositionUpdates() {
    this.positionTimer = setInterval(async () => {
      try {
        const openPositions = await this.prisma.position.findMany({
          where: { status: 'OPEN' },
          include: {
            symbol: { select: { name: true, contractSize: true, digits: true } },
          },
        })

        if (openPositions.length > 0) {
          this.logger.log(`[PositionTimer] Found ${openPositions.length} open positions to update.`);
        }

        for (const pos of openPositions) {
          const cfg = SYMBOLS[pos.symbol.name]
          const mid = this.midPrices.get(pos.symbol.name)
          if (!cfg) {
            this.logger.warn(`[PositionTimer] Missing config for symbol ${pos.symbol.name}`);
            continue;
          }
          if (!mid) {
            this.logger.warn(`[PositionTimer] No mid price in memory for symbol ${pos.symbol.name}`);
            continue;
          }

          // If the market is closed for this symbol, skip re-evaluating PnL and updating DB
          if (!isMarketOpen(pos.symbol.name)) {
            continue;
          }

          // 0.2 pip total spread → bid = mid - halfSpread, ask = mid + halfSpread
          const bid = mid - cfg.halfSpread
          const ask = mid + cfg.halfSpread
          // For BUY, we close at the bid. For SELL, we close at the ask.
          const closePrice = pos.side === 'BUY' ? bid : ask

          const openPrice = Number(pos.openPrice)
          const volume = Number(pos.volume)
          const contractSize = Number(pos.symbol.contractSize)
          const pnl = pos.side === 'BUY'
            ? (closePrice - openPrice) * volume * contractSize
            : (openPrice - closePrice) * volume * contractSize

          // Update position record in database
          await this.prisma.position.update({
            where: { id: pos.id },
            data: {
              currentPrice: new Prisma.Decimal(closePrice.toFixed(pos.symbol.digits)),
              floatingPnl: new Prisma.Decimal(pnl.toFixed(2)),
            },
          })

          // Broadcast real-time update over WebSockets
          this.notificationGateway.broadcastPositionUpdate(
            pos.brokerId,
            pos.id,
            pnl.toFixed(2),
            closePrice.toFixed(pos.symbol.digits),
          )
        }

        // Group positions by brokerId
        const brokerPositions = new Map<string, typeof openPositions>()
        for (const pos of openPositions) {
          const list = brokerPositions.get(pos.brokerId) || []
          list.push(pos)
          brokerPositions.set(pos.brokerId, list)
        }

        // Process stopouts for each broker
        for (const [brokerId, positions] of brokerPositions.entries()) {
          const config = this.spreadConfigCache.get(brokerId)
          const stopoutPercent = config?.stopoutPercent ?? 50
          const marginCallPercent = config?.marginCallPercent ?? 100

          const wallet = await this.prisma.wallet.findUnique({ where: { brokerId } })
          if (!wallet) continue

          const balances = {
            USDT: Number(wallet.balanceUSDT),
            USDC: Number(wallet.balanceUSDC),
            BTC: Number(wallet.balanceBTC),
            ETH: Number(wallet.balanceETH),
          }

          const walletBalance = balances.USDT + balances.USDC + (balances.BTC * 60000) + (balances.ETH * 3000)
          const creditLimit = Number(wallet.totalCreditUSD)

          let currentPositions = [...positions]
          while (currentPositions.length > 0) {
            const openPosInDb = await this.prisma.position.findMany({
              where: { brokerId, status: 'OPEN' }
            })
            if (openPosInDb.length === 0) break

            const totalFloatingPnl = openPosInDb.reduce((sum, p) => sum + Number(p.floatingPnl), 0)
            const usedMargin = openPosInDb.reduce((sum, p) => sum + Number(p.marginReservedUSD || 0), 0)

            const dbWallet = await this.prisma.wallet.findUnique({ where: { brokerId } })
            const currentWalletBalance = dbWallet ? (
              Number(dbWallet.balanceUSDT) +
              Number(dbWallet.balanceUSDC) +
              (Number(dbWallet.balanceBTC) * 60000) +
              (Number(dbWallet.balanceETH) * 3000)
            ) : walletBalance

            const equity = currentWalletBalance + creditLimit + totalFloatingPnl
            const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : 999999

            if (marginLevel <= stopoutPercent) {
              this.logger.warn(
                `[Stopout] Broker ${brokerId} hit stopout level! ` +
                `Margin Level: ${marginLevel.toFixed(1)}%, limit: ${stopoutPercent}%. Equity: $${equity.toFixed(2)}, Used Margin: $${usedMargin.toFixed(2)}. Liquidation triggered.`
              )

              const sorted = [...openPosInDb].sort((a, b) => Number(a.floatingPnl) - Number(b.floatingPnl))
              const worstPosition = sorted[0]
              if (worstPosition) {
                try {
                  this.logger.log(`[Stopout] Liquidating worst position: ${worstPosition.id} (${worstPosition.floatingPnl} loss)`)
                  await this.tradingService.closePosition(worstPosition.id, brokerId)
                } catch (closeErr) {
                  this.logger.error(`[Stopout] Failed to close position ${worstPosition.id}: ${closeErr}`)
                  break
                }
              } else {
                break
              }
            } else {
              if (marginLevel <= marginCallPercent) {
                this.logger.warn(
                  `[MarginCall] Warning: Broker ${brokerId} Margin Level is ${marginLevel.toFixed(1)}% ` +
                  `(limit: ${marginCallPercent}%). Equity: $${equity.toFixed(2)}, Margin: $${usedMargin.toFixed(2)}.`
                )
              }
              break
            }
          }
        }
      } catch (err) {
        this.logger.error(`Error during real-time position updates: ${err}`)
      }
    }, 3000) // update every 3s
  }

  // Public getter for REST endpoints
  getPrices(): Record<string, { bid: string; ask: string; mid: string }> {
    const result: Record<string, { bid: string; ask: string; mid: string }> = {}
    this.midPrices.forEach((mid, symbol) => {
      const cfg = SYMBOLS[symbol]
      if (!cfg) return
      result[symbol] = {
        mid: mid.toFixed(cfg.digits),
        bid: (mid - cfg.halfSpread).toFixed(cfg.digits),
        ask: (mid + cfg.halfSpread).toFixed(cfg.digits),
      }
    })
    return result
  }

  // ─── Public: Reload configuration from DB ─────────────────────────────────
  async reloadConfiguration(): Promise<void> {
    const settings = await this.prisma.systemSetting.findMany({
      where: { category: 'streaming' },
    })

    const get = (key: string) => settings.find(s => s.key === key)?.value ?? ''
    const source = (get('streaming:source') || 'default') as 'default' | 'deriv' | 'metaapi' | 'infoway'
    this.activeSource = source

    this.logger.log(`🔄 Reloading price feed — source: ${source}`)

    // Stop all existing streams before restarting
    this.stopAllStreams()

    // Always start baseline fallback feeds and micro-ticks so ALL instruments have continuous fresh quotes
    this.fetchFxRates().catch(() => {})
    this.fetchMetalPrices().catch(() => {})
    this.connectBinanceWs()
    this.startFxPoll()
    this.startMetalPoll()
    this.startMicroTicks()

    if (source === 'deriv') {
      const appId = get('streaming:deriv:appId') || '1089'
      this.logger.log(`📡 Connecting to Deriv WebSocket (App ID: ${appId})`)
      this.connectDerivWs(appId)
      this.startPositionUpdates()
      return
    }

    if (source === 'metaapi') {
      const token = get('streaming:metaapi:token')
      if (!token) {
        this.logger.warn('MetaAPI token not configured — falling back to default feed')
      } else {
        this.logger.log('📡 Starting MetaAPI price poll')
        this.startMetaapiPoll(token)
        this.startPositionUpdates()
        return
      }
    }

    if (source === 'infoway') {
      const apiUrl = get('streaming:infoway:apiUrl')
      const apiKey = get('streaming:infoway:apiKey')
      if (!apiUrl) {
        this.logger.warn('Infoway API URL not configured — falling back to default feed')
      } else {
        this.logger.log(`📡 Starting Infoway price poll (${apiUrl})`)
        this.startInfowayPoll(apiUrl, apiKey)
        this.startPositionUpdates()
        return
      }
    }

    // Default: Binance (crypto) + Yahoo Finance (metals) + ECB (forex)
    this.logger.log('📡 Using default feed: Binance + Yahoo Finance + Open Exchange Rates')
    this.startPositionUpdates()
  }

  // ─── Public: Test connection for a given provider ─────────────────────────
  async testConnection(
    source: 'deriv' | 'metaapi' | 'infoway',
    config: { appId?: string | null; token?: string | null; apiUrl?: string | null; apiKey?: string | null },
  ): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const t0 = Date.now()

    if (source === 'deriv') {
      const appId = config.appId || '1089'
      return new Promise((resolve) => {
        const WS = (globalThis as any).WebSocket
        if (!WS) {
          resolve({ success: false, message: 'WebSocket not available in this environment' })
          return
        }
        const ws = new WS(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`)
        const timeout = setTimeout(() => {
          try { ws.close() } catch {}
          resolve({ success: false, message: 'Deriv WebSocket connection timed out (10s)' })
        }, 10_000)

        ws.onopen = () => {
          ws.send(JSON.stringify({ ping: 1 }))
        }
        ws.onmessage = (event: any) => {
          clearTimeout(timeout)
          try { ws.close() } catch {}
          resolve({ success: true, message: 'Connected to Deriv WebSocket successfully', latencyMs: Date.now() - t0 })
        }
        ws.onerror = () => {
          clearTimeout(timeout)
          resolve({ success: false, message: 'Failed to connect to Deriv WebSocket. Check App ID.' })
        }
      })
    }

    if (source === 'metaapi') {
      const token = config.token
      if (!token) return { success: false, message: 'MetaAPI token is required' }
      try {
        const res = await fetch('https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts?limit=1', {
          headers: { 'auth-token': token },
        })
        if (res.ok) {
          return { success: true, message: 'MetaAPI token verified successfully', latencyMs: Date.now() - t0 }
        }
        const text = await res.text()
        return { success: false, message: `MetaAPI returned ${res.status}: ${text.slice(0, 200)}` }
      } catch (err: any) {
        return { success: false, message: `MetaAPI connection error: ${err.message}` }
      }
    }

    if (source === 'infoway') {
      const apiUrl = config.apiUrl
      const apiKey = config.apiKey
      if (!apiUrl) return { success: false, message: 'Infoway API URL is required' }
      try {
        const headers: Record<string, string> = { 'Accept': 'application/json' }
        if (apiKey) headers['X-API-Key'] = apiKey
        const res = await fetch(apiUrl, { headers })
        if (res.ok) {
          const data = await res.json()
          return { success: true, message: 'Infoway API connection successful', latencyMs: Date.now() - t0 }
        }
        return { success: false, message: `Infoway API returned HTTP ${res.status}` }
      } catch (err: any) {
        return { success: false, message: `Infoway API connection error: ${err.message}` }
      }
    }

    return { success: false, message: 'Unknown source' }
  }

  // ─── Deriv WebSocket Stream ────────────────────────────────────────────────
  private connectDerivWs(appId: string) {
    const WS = (globalThis as any).WebSocket
    if (!WS) {
      this.logger.warn('WebSocket not available — cannot connect to Deriv')
      return
    }

    const url = `wss://api.derivws.com/trading/v1/options/ws/public?app_id=${appId}`
    this.logger.log(`Connecting to Deriv stream: ${url}`)
    this.derivWs = new WS(url)

    // Symbol map: Deriv symbol → platform symbol
    const DERIV_SYMBOL_MAP: Record<string, string> = {
      frxEURUSD: 'EURUSD', frxGBPUSD: 'GBPUSD', frxUSDJPY: 'USDJPY',
      frxAUDUSD: 'AUDUSD', frxNZDUSD: 'NZDUSD', frxEURNZD: 'EURNZD',
      frxGBPNZD: 'GBPNZD', frxEURAUD: 'EURAUD', frxGBPAUD: 'GBPAUD',
      frxAUDJPY: 'AUDJPY', frxGBPJPY: 'GBPJPY', frxCADJPY: 'CADJPY',
      frxXAUUSD: 'XAUUSD', frxXAGUSD: 'XAGUSD',
      cryBTCUSD: 'BTCUSD', cryETHUSD: 'ETHUSD',
      R_10: 'XRPUSD',  // mapping volatile index to XRP for demo
    }

    const derivSymbols = Object.keys(DERIV_SYMBOL_MAP)

    this.derivWs.onopen = () => {
      this.logger.log('✅ Connected to Deriv WebSocket')
      
      // Start ping heartbeat interval every 30s to keep connection alive
      if (this.derivPingTimer) clearInterval(this.derivPingTimer)
      this.derivPingTimer = setInterval(() => {
        if (this.derivWs && this.derivWs.readyState === WS.OPEN) {
          this.derivWs.send(JSON.stringify({ ping: 1 }))
        }
      }, 30000)

      // Subscribe to tick streams for all symbols
      for (const sym of derivSymbols) {
        this.derivWs.send(JSON.stringify({ ticks: sym, subscribe: 1 }))
      }

      // Periodically retry subscribing to symbols in case market opened or reconnected
      if (this.derivResubTimer) clearInterval(this.derivResubTimer)
      this.derivResubTimer = setInterval(() => {
        if (this.derivWs && this.derivWs.readyState === WS.OPEN) {
          for (const sym of derivSymbols) {
            this.derivWs.send(JSON.stringify({ ticks: sym, subscribe: 1 }))
          }
        }
      }, 60000)
    }

    this.derivWs.onmessage = (event: any) => {
      try {
        const data = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
        if (data.error) {
          this.logger.warn(`Deriv WS notification for symbol ${data.echo_req?.ticks || 'unknown'}: ${data.error.message}`)
          return
        }
        if (data.tick) {
          const derivSym = data.tick.symbol
          const bid = parseFloat(data.tick.bid || data.tick.quote)
          const ask = parseFloat(data.tick.ask || data.tick.quote)
          const mid = (bid + ask) / 2
          const platform = DERIV_SYMBOL_MAP[derivSym]
          if (platform && !isNaN(mid) && mid > 0) {
            this.publishPrice(platform, mid)
          }
        }
      } catch {}
    }

    this.derivWs.onerror = (err: any) => {
      this.logger.error(`Deriv WS connection error: ${err?.message || String(err)}`)
    }

    this.derivWs.onclose = () => {
      if (this.derivPingTimer) {
        clearInterval(this.derivPingTimer)
        this.derivPingTimer = null
      }
      if (this.derivResubTimer) {
        clearInterval(this.derivResubTimer)
        this.derivResubTimer = null
      }
      if (this.destroyed) return
      this.logger.warn('Deriv WS closed. Reconnecting in 5s...')
      setTimeout(() => {
        if (!this.destroyed) this.connectDerivWs(appId)
      }, 5_000)
    }
  }

  // ─── MetaAPI REST poll ─────────────────────────────────────────────────────
  private startMetaapiPoll(token: string) {
    const pollOnce = async () => {
      try {
        // Fetch list of accounts and use the first active one
        const accountsRes = await fetch(
          'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts?limit=1',
          { headers: { 'auth-token': token } },
        )
        if (!accountsRes.ok) return
        const accounts: any[] = await accountsRes.json()
        if (!accounts?.length) return
        const accountId = accounts[0].id

        // Fetch quotes for all symbols
        const symbolList = Object.keys(SYMBOLS).join(',')
        const quotesRes = await fetch(
          `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${accountId}/symbols/current-prices?symbols=${symbolList}&keepSubscriptions=false`,
          { headers: { 'auth-token': token } },
        )
        if (!quotesRes.ok) return
        const quotes: any[] = await quotesRes.json()
        for (const q of quotes) {
          if (q.symbol && q.bid && q.ask) {
            const mid = (parseFloat(q.bid) + parseFloat(q.ask)) / 2
            if (!isNaN(mid) && mid > 0) this.publishPrice(q.symbol, mid)
          }
        }
      } catch (err) {
        this.logger.warn(`MetaAPI poll error: ${err}`)
      }
    }

    pollOnce()
    this.metaapiTimer = setInterval(pollOnce, 5_000)
    this.startMicroTicks()
  }

  // ─── Infoway REST poll ──────────────────────────────────────────────────────
  private startInfowayPoll(apiUrl: string, apiKey: string | null) {
    const pollOnce = async () => {
      try {
        const headers: Record<string, string> = { 'Accept': 'application/json' }
        if (apiKey) headers['X-API-Key'] = apiKey

        const res = await fetch(apiUrl, { headers })
        if (!res.ok) return

        const data: any = await res.json()
        // Expect data as array of { symbol, bid, ask } or { symbol, price }
        const items: any[] = Array.isArray(data) ? data : (data.data ?? data.rates ?? data.prices ?? [])
        for (const item of items) {
          const symbol: string = (item.symbol ?? item.pair ?? '').toString().replace('/', '').toUpperCase()
          const bid = parseFloat(item.bid ?? item.price ?? 0)
          const ask = parseFloat(item.ask ?? item.price ?? 0)
          const mid = (bid + ask) / 2
          if (SYMBOLS[symbol] && !isNaN(mid) && mid > 0) {
            this.publishPrice(symbol, mid)
          }
        }
      } catch (err) {
        this.logger.warn(`Infoway poll error: ${err}`)
      }
    }

    pollOnce()
    this.infowayTimer = setInterval(pollOnce, 3_000)
    this.startMicroTicks()
  }
}

