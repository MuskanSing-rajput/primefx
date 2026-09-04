'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Position, WsPositionUpdate, WsPriceUpdate } from '@lp/shared-types'
import { WS_EVENTS } from '@lp/constants'
import { useSocketContext } from '@/providers/SocketProvider'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

function isMarketOpen(symbol: string): boolean {
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

async function fetchPositions(): Promise<Position[]> {
  const res = await fetch('/api/positions', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as { data: Position[] }
  return body.data
}

function DateTimeCell({ dateString }: { dateString: string }) {
  const [fmt, setFmt] = useState('')
  useEffect(() => { setFmt(new Date(dateString).toLocaleString()) }, [dateString])
  return <span>{fmt || '—'}</span>
}

type FilterTab = 'OPEN' | 'CLOSED'

export default function BrokerPositionsPage() {
  const [filter, setFilter] = useState<FilterTab>('OPEN')
  const [closingId, setClosingId] = useState<string | null>(null)
  const { accountSocket, pricesSocket } = useSocketContext()
  const [liveUpdates, setLiveUpdates] = useState<Record<string, { floatingPnl: string; currentPrice: string }>>({})

  const { data: positions, isLoading, refetch } = useQuery({
    queryKey: ['positions', 'all'],
    queryFn: fetchPositions,
    refetchInterval: 3000,
  })

  // Listen for real-time position updates over WebSockets
  useEffect(() => {
    if (!accountSocket) return
    const handlePosUpdate = (update: WsPositionUpdate) => {
      if (update?.positionId) {
        setLiveUpdates(prev => ({
          ...prev,
          [update.positionId]: {
            floatingPnl: update.floatingPnl,
            currentPrice: update.currentPrice,
          },
        }))
      }
    }
    accountSocket.on(WS_EVENTS.POSITION_UPDATE, handlePosUpdate)
    return () => {
      accountSocket.off(WS_EVENTS.POSITION_UPDATE, handlePosUpdate)
    }
  }, [accountSocket])

  // Listen for real-time price ticks and calculate live floating PnL
  useEffect(() => {
    if (!pricesSocket || !positions) return
    const handlePriceUpdate = (update: WsPriceUpdate) => {
      if (!update?.symbol) return
      const cleanSym = update.symbol.replace('/', '').toUpperCase()

      setLiveUpdates(prev => {
        let changed = false
        const next = { ...prev }

        for (const p of positions) {
          if (p.status !== 'OPEN') continue
          const pos = p as any
          const posSym = (pos.symbol?.name ?? pos.symbolName ?? '').replace('/', '').toUpperCase()
          if (posSym === cleanSym) {
            const openPrice = Number(pos.openPrice)
            const volume = Number(pos.volume)
            const contractSize = Number(pos.symbol?.contractSize ?? 100000)
            const closePrice = pos.side === 'BUY' ? Number(update.bid) : Number(update.ask)
            const pnl = pos.side === 'BUY'
              ? (closePrice - openPrice) * volume * contractSize
              : (openPrice - closePrice) * volume * contractSize

            const digits = pos.symbol?.digits ?? 5
            next[pos.id] = {
              floatingPnl: pnl.toFixed(2),
              currentPrice: closePrice.toFixed(digits),
            }
            changed = true
          }
        }
        return changed ? next : prev
      })
    }

    pricesSocket.on(WS_EVENTS.PRICE_UPDATE, handlePriceUpdate)
    return () => {
      pricesSocket.off(WS_EVENTS.PRICE_UPDATE, handlePriceUpdate)
    }
  }, [pricesSocket, positions])

  const handleClosePosition = async (id: string) => {
    if (!confirm('Are you sure you want to manually close this position on the broker house account?')) return
    setClosingId(id)
    try {
      const res = await fetch(`/api/positions/${id}/close`, { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        throw new Error('Failed to close position')
      }
      refetch()
    } catch (err: any) {
      alert(err.message || 'An error occurred while closing position')
    } finally {
      setClosingId(null)
    }
  }

  const filtered = useMemo(() => {
    if (!positions) return []
    return positions.filter(p => p.status === filter)
  }, [positions, filter])

  const openPositions = useMemo(() => {
    return positions?.filter(p => p.status === 'OPEN') ?? []
  }, [positions])

  const closedPositions = useMemo(() => {
    return positions?.filter(p => p.status === 'CLOSED') ?? []
  }, [positions])

  const openCount = openPositions.length
  const closedCount = closedPositions.length
  const totalTrades = positions?.length ?? 0

  const totalVolume = useMemo(() => {
    return (positions ?? []).reduce((a, p) => a + parseFloat(p.volume || '0'), 0)
  }, [positions])

  const openVolume = useMemo(() => {
    return openPositions.reduce((a, p) => a + parseFloat(p.volume || '0'), 0)
  }, [openPositions])

  const realisedPnl = useMemo(() => {
    return closedPositions.reduce((a, p) => {
      return a + Number((p as any).closedPnl ?? p.floatingPnl ?? 0)
    }, 0)
  }, [closedPositions])

  const unrealisedPnl = useMemo(() => {
    return openPositions.reduce((a, p) => {
      const live = liveUpdates[p.id]
      const fPnl = live?.floatingPnl !== undefined ? Number(live.floatingPnl) : Number(p.floatingPnl || 0)
      return a + fPnl
    }, 0)
  }, [openPositions, liveUpdates])

  const leverageUsed = useMemo(() => {
    if (!positions || positions.length === 0) return 100
    const active = openPositions.length > 0 ? openPositions : positions
    const levs = active.map(p => (p as any).leverageAtOpen || (p as any).client?.leverage).filter(Boolean)
    return levs.length > 0 ? levs[0] : 100
  }, [positions, openPositions])

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'OPEN',   label: `Open (${openCount})` },
    { key: 'CLOSED', label: `Closed (${closedCount})` },
  ]

  return (
    <>
      <div className={s.pageHeader} style={{ justifyContent: 'flex-end' }}>
        <div className={s.pageActions}>
          <div className={s.liveRow} style={{ margin: 0 }}>
            <span className={s.liveDot}/>
            <span className={s.liveLabel}>Streaming</span>
          </div>
        </div>
      </div>

      {/* Stat cards: Realised PnL, Unrealised PnL, Total Vol, Leverage Used, Total Trades, Open Volume */}
      <div className={s.statGrid} style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 20 }}>
        {/* Realised PnL */}
        <div className={`${s.statCard} ${realisedPnl >= 0 ? s.statCardAccentGreen : s.statCardAccentRed}`}>
          <div className={s.statLabel}>Realised PnL</div>
          <div className={s.statValue} style={{ color: realisedPnl >= 0 ? '#10b981' : '#ef4444', fontSize: 20 }}>
            {isLoading ? '—' : `${realisedPnl >= 0 ? '+' : '-'}$${Math.abs(realisedPnl).toFixed(2)}`}
          </div>
        </div>

        {/* Unrealised PnL (Live) */}
        <div className={`${s.statCard} ${unrealisedPnl >= 0 ? s.statCardAccentGreen : s.statCardAccentRed}`}>
          <div className={s.statLabel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Unrealised PnL</span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }}/>
          </div>
          <div className={s.statValue} style={{ color: unrealisedPnl >= 0 ? '#10b981' : '#ef4444', fontSize: 20 }}>
            {isLoading ? '—' : `${unrealisedPnl >= 0 ? '+' : '-'}$${Math.abs(unrealisedPnl).toFixed(2)}`}
          </div>
        </div>

        {/* Total Volume */}
        <div className={`${s.statCard} ${s.statCardAccentMag}`}>
          <div className={s.statLabel}>Total Volume</div>
          <div className={s.statValue} style={{ fontSize: 20 }}>{isLoading ? '—' : `${totalVolume.toFixed(2)} lots`}</div>
        </div>

        {/* Leverage Used */}
        <div className={s.statCard}>
          <div className={s.statLabel}>Leverage Used</div>
          <div className={s.statValue} style={{ fontSize: 20 }}>{isLoading ? '—' : `1:${leverageUsed}`}</div>
        </div>

        {/* Total Trades */}
        <div className={s.statCard}>
          <div className={s.statLabel}>Total Trades</div>
          <div className={s.statValue} style={{ fontSize: 20 }}>{isLoading ? '—' : totalTrades}</div>
        </div>

        {/* Open Volume */}
        <div className={`${s.statCard} ${s.statCardAccentTeal}`}>
          <div className={s.statLabel}>Open Volume</div>
          <div className={s.statValue} style={{ fontSize: 20 }}>{isLoading ? '—' : `${openVolume.toFixed(2)} lots`}</div>
        </div>
      </div>

      {/* Tab filters */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{
              height: 32, padding: '0 16px', borderRadius: 8, border: '1px solid var(--card-border)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filter === t.key ? 'var(--btn-active-bg)' : 'var(--item-hover)',
              color: filter === t.key ? 'var(--btn-active-color)' : 'var(--text-muted)',
              transition: 'all 150ms',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Table */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>Position Records</span>
          <span className={`${s.chip} ${s.chipNeutral}`}>{filtered.length} records</span>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Symbol</th><th>Client</th><th>Side</th><th>Volume</th>
                <th>Open Price</th>
                <th>{filter === 'OPEN' ? 'Current Price' : 'Exit Price'}</th>
                <th>{filter === 'OPEN' ? 'Floating PnL' : 'P&L'}</th>
                <th>Commission</th><th>Spread</th><th>Status</th><th>Opened</th>
                {filter === 'OPEN' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={filter === 'OPEN' ? 12 : 11}><div className={s.emptyState}><div className={s.spinner}/><div className={s.emptyText}>Loading positions…</div></div></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={filter === 'OPEN' ? 12 : 11}>
                  <div className={s.emptyState}>
                    <div className={s.emptyIcon}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>
                    </div>
                    <div className={s.emptyText}>No positions found</div>
                  </div>
                </td></tr>
              ) : filtered.map(p => {
                const pos = p as any
                const live = liveUpdates[pos.id]
                const curPrice = pos.status === 'OPEN' && live?.currentPrice !== undefined
                  ? parseFloat(live.currentPrice).toFixed(pos.symbol?.digits ?? 5)
                  : parseFloat(pos.currentPrice).toFixed(pos.symbol?.digits ?? 5)

                const pnl = pos.status === 'OPEN'
                  ? (live?.floatingPnl !== undefined ? Number(live.floatingPnl) : Number(pos.floatingPnl || 0))
                  : Number(pos.closedPnl ?? pos.floatingPnl ?? 0)

                return (
                  <tr key={pos.id}>
                    <td className={s.tableMono}>
                      {pos.symbol?.name ?? '—'}
                      {!isMarketOpen(pos.symbol?.name ?? '') && (
                        <div style={{ fontSize: 9, fontWeight: 500, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }}></span>
                          Market Closed
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {pos.client ? `${pos.client.firstName} ${pos.client.lastName}` : '—'}
                    </td>
                    <td>
                      <span className={`${s.chip} ${pos.side === 'BUY' ? s.chipGreen : s.chipRed}`}>
                        <span className={s.chipDot}/>{pos.side}
                      </span>
                    </td>
                    <td className={s.tableMono}>{parseFloat(pos.volume).toFixed(2)}</td>
                    <td className={s.tableMono}>{parseFloat(pos.openPrice).toFixed(pos.symbol?.digits ?? 5)}</td>
                    <td className={s.tableMono}>{curPrice}</td>
                    <td className={s.tableMono} style={{ color: pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                    </td>
                    <td className={s.tableMono}>{parseFloat(pos.commission).toFixed(2)}</td>
                    <td className={s.tableMono}>
                      {(() => {
                        const PIP_SIZES: Record<string, number> = {
                          EURUSD: 0.0001, GBPUSD: 0.0001, USDJPY: 0.01, AUDUSD: 0.0001, NZDUSD: 0.0001,
                          EURNZD: 0.0001, GBPNZD: 0.0001, EURAUD: 0.0001, GBPAUD: 0.0001, AUDJPY: 0.01,
                          GBPJPY: 0.01, CADJPY: 0.01, XAUUSD: 0.1, XAGUSD: 0.001, XAUEUR: 0.1,
                          XAGAUD: 0.001, BTCUSD: 1.0, ETHUSD: 0.1, LTCUSD: 0.01, XRPUSD: 0.0001,
                          UNIUSD: 0.0001,
                        }
                        const symbolName = pos.symbol?.name ?? ''
                        const digits = pos.symbol?.digits ?? 5
                        const pipSize = PIP_SIZES[symbolName] ?? Math.pow(10, -(digits - 1))

                        const rawSpread = Number(pos.order?.lpRawSpread ?? pos.symbol?.rawSpread ?? 0)
                        const markupPips = Number(pos.order?.spreadMarkupApplied ?? 0)
                        const markupPricePoints = markupPips * pipSize

                        return (rawSpread + markupPricePoints).toFixed(digits)
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const isOpen = pos.status === 'OPEN';
                        const isMktOpen = isMarketOpen(pos.symbol?.name ?? '');
                        
                        if (isOpen) {
                          if (isMktOpen) {
                            return (
                              <span className={`${s.chip} ${s.chipGreen}`}>
                                <span className={s.chipDot}/>OPEN
                              </span>
                            );
                          } else {
                            return (
                              <span className={`${s.chip} ${s.chipRed}`}>
                                <span className={s.chipDot}/>MKT CLOSED
                              </span>
                            );
                          }
                        } else {
                          return (
                            <span className={`${s.chip} ${s.chipNeutral}`}>
                              <span className={s.chipDot}/>{pos.status}
                            </span>
                          );
                        }
                      })()}
                    </td>
                    <td className={s.tableMono}><DateTimeCell dateString={pos.openedAt}/></td>
                    {filter === 'OPEN' && (
                      <td>
                        <button
                          onClick={() => handleClosePosition(pos.id)}
                          disabled={closingId === pos.id}
                          style={{
                            height: 24,
                            padding: '0 10px',
                            borderRadius: 6,
                            border: '1px solid #ef4444',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: closingId === pos.id ? 'var(--item-hover)' : 'rgba(239, 68, 68, 0.08)',
                            color: '#ef4444',
                            transition: 'all 150ms',
                          }}
                        >
                          {closingId === pos.id ? 'Closing...' : 'Close'}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
