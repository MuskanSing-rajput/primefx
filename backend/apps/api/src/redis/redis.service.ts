import { Injectable, Inject, Logger } from '@nestjs/common'
import type { Redis } from 'ioredis'
import { REDIS_KEYS } from '@lp/constants'

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name)

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  // ─── Generic Operations ───────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, value)
    } else {
      await this.redis.set(key, value)
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key)
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key)
    return result === 1
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(key, ttlSeconds)
  }

  // ─── Hash Operations ──────────────────────────────────────────────────────

  async hset(key: string, data: Record<string, string>): Promise<void> {
    await this.redis.hset(key, data)
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.redis.hget(key, field)
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key)
  }

  // ─── Pub/Sub ──────────────────────────────────────────────────────────────

  async publish(channel: string, message: string): Promise<void> {
    await this.redis.publish(channel, message)
  }

  // ─── Price Feed ───────────────────────────────────────────────────────────

  async setPrice(symbol: string, bid: string, ask: string): Promise<void> {
    const key = REDIS_KEYS.PRICE(symbol)
    await this.redis.hset(key, {
      bid,
      ask,
      spread: String(parseFloat(ask) - parseFloat(bid)),
      ts: String(Date.now()),
    })
    await this.publish('channel:prices', JSON.stringify({ symbol, bid, ask, timestamp: Date.now() }))
  }

  async getPrice(symbol: string): Promise<{ bid: string; ask: string; ts: string } | null> {
    const key = REDIS_KEYS.PRICE(symbol)
    const data = await this.redis.hgetall(key)
    if (!data || !data['bid']) return null
    return { bid: data['bid']!, ask: data['ask']!, ts: data['ts']! }
  }

  async getAllPrices(symbols: string[]): Promise<Record<string, { bid: string; ask: string; ts: string }>> {
    const pipeline = this.redis.pipeline()
    symbols.forEach((s) => pipeline.hgetall(REDIS_KEYS.PRICE(s)))
    const results = await pipeline.exec()
    const prices: Record<string, { bid: string; ask: string; ts: string }> = {}
    results?.forEach((result, i) => {
      const symbol = symbols[i]
      const data = result[1] as Record<string, string>
      if (symbol && data?.['bid']) {
        prices[symbol] = { bid: data['bid']!, ask: data['ask']!, ts: data['ts']! }
      }
    })
    return prices
  }

  // ─── Per-Broker Raw Price Storage (for spread visibility) ─────────────────
  // Key pattern: raw:{brokerId}:{symbol}
  // Stores the raw MT5/feed bid+ask BEFORE any LP markup is applied.

  async setBrokerRawPrice(brokerId: string, symbol: string, rawBid: string, rawAsk: string): Promise<void> {
    const key = `raw:${brokerId}:${symbol}`
    await this.redis.hset(key, {
      rawBid,
      rawAsk,
      rawSpread: String((parseFloat(rawAsk) - parseFloat(rawBid)).toFixed(6)),
      ts: String(Date.now()),
    })
    // 30s TTL — if feed stops, stale data doesn't linger forever
    await this.redis.expire(key, 30)
  }

  async getBrokerRawPrice(brokerId: string, symbol: string): Promise<{ rawBid: string; rawAsk: string; rawSpread: string; ts: string } | null> {
    const key = `raw:${brokerId}:${symbol}`
    const data = await this.redis.hgetall(key)
    if (!data || !data['rawBid']) return null
    return {
      rawBid: data['rawBid']!,
      rawAsk: data['rawAsk']!,
      rawSpread: data['rawSpread'] ?? '0',
      ts: data['ts']!,
    }
  }

  async getAllBrokerRawPrices(brokerId: string, symbols: string[]): Promise<Record<string, { rawBid: string; rawAsk: string; rawSpread: string; ts: string }>> {
    const pipeline = this.redis.pipeline()
    symbols.forEach((s) => pipeline.hgetall(`raw:${brokerId}:${s}`))
    const results = await pipeline.exec()
    const prices: Record<string, { rawBid: string; rawAsk: string; rawSpread: string; ts: string }> = {}
    results?.forEach((result, i) => {
      const symbol = symbols[i]
      const data = result[1] as Record<string, string>
      if (symbol && data?.['rawBid']) {
        prices[symbol] = {
          rawBid: data['rawBid']!,
          rawAsk: data['rawAsk']!,
          rawSpread: data['rawSpread'] ?? '0',
          ts: data['ts']!,
        }
      }
    })
    return prices
  }

  // ─── Rate Limiting ────────────────────────────────────────────────────────

  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const current = await this.redis.incr(key)
    if (current === 1) {
      await this.redis.pexpire(key, windowMs)
    }
    return current <= limit
  }

  // ─── Cache ────────────────────────────────────────────────────────────────

  async cacheGet<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async cacheSet<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value))
  }

  async cacheInvalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern)
    if (keys.length > 0) {
      await this.redis.del(...keys)
    }
  }
}
