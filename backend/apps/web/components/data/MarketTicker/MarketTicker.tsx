'use client'

import React, { useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TradingSymbol, WsPriceUpdate } from '@lp/shared-types'
import styles from './MarketTicker.module.css'

async function fetchSymbols(): Promise<TradingSymbol[]> {
  const res = await fetch('/api/symbols?activeOnly=true', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch symbols')
  const body = await res.json() as { data: TradingSymbol[] }
  return body.data
}

function getCategoryClass(cat: string): string {
  switch (cat) {
    case 'FOREX': return styles.categoryForex ?? ''
    case 'CFD':   return styles.categoryCfd ?? ''
    case 'CRYPTO': return styles.categoryCrypto ?? ''
    default: return ''
  }
}

/**
 * Simulates live bid/ask prices by deriving from symbol rawSpread.
 * In production, this would come from a WebSocket price feed.
 */
function simulatePrice(symbol: TradingSymbol): { bid: string; ask: string; spread: string } {
  const basePrices: Record<string, number> = {
    EURUSD: 1.08432,
    GBPUSD: 1.26718,
    USDJPY: 154.325,
    XAUUSD: 2345.50,
  }

  const base = basePrices[symbol.name] ?? 1.0
  const rawSpread = parseFloat(symbol.rawSpread)

  // Add small random variance (±0.002%) to simulate movement
  const variance = (Math.random() - 0.5) * base * 0.00004
  const bid = base + variance
  const ask = bid + rawSpread

  const digits = symbol.digits
  return {
    bid: bid.toFixed(digits),
    ask: ask.toFixed(digits),
    spread: (rawSpread * Math.pow(10, digits)).toFixed(1),
  }
}

interface PriceState {
  bid: string
  ask: string
  spread: string
  bidDir: 'up' | 'down' | 'neutral'
  askDir: 'up' | 'down' | 'neutral'
}

export function MarketTicker() {
  const prevPrices = useRef<Record<string, { bid: string; ask: string }>>({})
  const [prices, setPrices] = React.useState<Record<string, PriceState>>({})
  const queryClient = useQueryClient()

  const { data: symbols, isLoading } = useQuery({
    queryKey: ['symbols', 'active'],
    queryFn: fetchSymbols,
  })

  // Simulate price updates every 2 seconds
  useEffect(() => {
    if (!symbols || symbols.length === 0) return

    const update = () => {
      const newPrices: Record<string, PriceState> = {}
      symbols.forEach((sym) => {
        // Prefer live price ticks coming from the socket (cached in React Query)
        const tick = queryClient.getQueryData<WsPriceUpdate>(['price', sym.name])
        const price = tick ? { bid: tick.bid, ask: tick.ask, spread: tick.spread } : simulatePrice(sym)
        const prev = prevPrices.current[sym.name]
        const bidDir = !prev ? 'neutral' : price.bid > prev.bid ? 'up' : price.bid < prev.bid ? 'down' : 'neutral'
        const askDir = !prev ? 'neutral' : price.ask > prev.ask ? 'up' : price.ask < prev.ask ? 'down' : 'neutral'

        newPrices[sym.name] = {
          bid: String(price.bid),
          ask: String(price.ask),
          spread: String(price.spread ?? ''),
          bidDir,
          askDir,
        }
        prevPrices.current[sym.name] = { bid: String(price.bid), ask: String(price.ask) }
      })
      setPrices(newPrices)
    }

    update()
    const interval = setInterval(update, 2000)
    return () => clearInterval(interval)
  }, [symbols])

  const getPriceClass = (dir: 'up' | 'down' | 'neutral') => {
    if (dir === 'up') return styles.priceUp
    if (dir === 'down') return styles.priceDown
    return styles.priceNeutral
  }

  return (
    <div className={styles.tickerContainer}>
      <div className={styles.tickerHeader}>
        <span className={styles.tickerTitle}>Live Market Prices</span>
        <span className="live-indicator">Live</span>
      </div>
      <table className={styles.tickerTable}>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Bid</th>
            <th>Ask</th>
            <th>Spread</th>
            <th>Commission</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className={styles.skeletonRow}>
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j}><div className={`skeleton ${styles.skeletonCell}`} /></td>
                ))}
              </tr>
            ))
          ) : (
            symbols?.map((sym) => {
              const p = prices[sym.name]
              return (
                <tr key={sym.id}>
                  <td>
                    {sym.name}
                    <span className={`${styles.categoryBadge} ${getCategoryClass(sym.category)}`}>
                      {sym.category}
                    </span>
                  </td>
                  <td className={p ? getPriceClass(p.bidDir) : ''} key={`bid-${p?.bid}`}>
                    {p?.bid ?? '—'}
                  </td>
                  <td className={p ? getPriceClass(p.askDir) : ''} key={`ask-${p?.ask}`}>
                    {p?.ask ?? '—'}
                  </td>
                  <td className={`${styles.spread} ${parseFloat(p?.spread ?? '0') <= 1.5 ? styles.spreadLow : ''}`}>
                    {p?.spread ?? '—'} pips
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    ${parseFloat(sym.rawCommission).toFixed(2)}/lot
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
