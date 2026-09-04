'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import s from './trades.module.css'

interface PositionItem {
  id: string
  brokerId: string
  clientId: string
  symbolId: string
  side: 'BUY' | 'SELL'
  volume: string
  openPrice: string
  currentPrice: string
  closePrice?: string
  floatingPnl?: string
  realizedPnl?: string
  closedPnl?: string
  marginReservedUSD: string
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED'
  mode: 'DEMO' | 'LIVE'
  closeReason?: string
  openedAt: string
  closedAt?: string
  broker: { id: string; companyName: string; email: string }
  client: { id: string; firstName: string; lastName: string; email: string }
  symbol: { id: string; name: string; displayName: string; digits: number }
  order?: { id: string; lpRawSpread: string; spreadMarkupApplied: string }
}

interface PositionsResponse {
  data: PositionItem[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    openCount: number
    closedCount: number
    totalFloatingPnl: number
    totalMarginUSD: number
    totalOpenVolume: number
  }
}

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

async function fetchAdminPositions(params: {
  status?: string
  brokerId?: string
  search?: string
  page?: number
}) {
  const query = new URLSearchParams()
  if (params.status && params.status !== 'ALL') query.set('status', params.status)
  if (params.brokerId && params.brokerId !== 'ALL') query.set('brokerId', params.brokerId)
  if (params.search) query.set('search', params.search)
  if (params.page) query.set('page', String(params.page))

  const res = await fetch(`/api/v1/admin/positions?${query.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch positions')
  const json = await res.json()
  return (json.data || json) as PositionsResponse
}

async function fetchApprovedBrokers() {
  const res = await fetch('/api/v1/admin/spread-charges/brokers')
  if (!res.ok) return []
  const json = await res.json()
  return json.data || []
}

async function closePositionApi(positionId: string) {
  const res = await fetch(`/api/v1/admin/positions/${positionId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Failed to close position')
  }
  return res.json()
}

export default function AdminTradesPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'OPEN' | 'CLOSED' | 'ALL'>('OPEN')
  const [brokerFilter, setBrokerFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [page, setPage] = useState<number>(1)
  const [closingPos, setClosingPos] = useState<PositionItem | null>(null)
  const [closeError, setCloseError] = useState<string | null>(null)

  const { data: brokers } = useQuery({
    queryKey: ['admin', 'brokers-list'],
    queryFn: fetchApprovedBrokers,
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'positions', activeTab, brokerFilter, searchTerm, page],
    queryFn: () => fetchAdminPositions({ status: activeTab, brokerId: brokerFilter, search: searchTerm, page }),
    refetchInterval: 3000, // Live 3s polling for real-time trade monitoring
  })

  const closeMutation = useMutation({
    mutationFn: closePositionApi,
    onSuccess: () => {
      setClosingPos(null)
      setCloseError(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'positions'] })
    },
    onError: (err: any) => {
      setCloseError(err.message)
    },
  })

  const meta = data?.meta

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', color: 'var(--text-primary)' }}>
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Trades & Positions Management
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Monitor and manage running positions and trade history across all brokers and clients
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => refetch()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🔄 Refresh Feeds
          </button>
        </div>
      </div>

      {/* ─── Metrics Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className={s.metricCard}>
          <div className={s.metricLabel}>Active Running Trades</div>
          <div className={s.metricValue} style={{ color: '#60cdf6' }}>
            {meta?.openCount ?? 0}
          </div>
          <div className={s.metricSub}>Live open positions</div>
        </div>

        <div className={s.metricCard}>
          <div className={s.metricLabel}>Total Floating PnL</div>
          <div className={s.metricValue} style={{ color: (meta?.totalFloatingPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
            ${(meta?.totalFloatingPnl ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={s.metricSub}>Net unrealized profit/loss</div>
        </div>

        <div className={s.metricCard}>
          <div className={s.metricLabel}>Total Reserved Margin</div>
          <div className={s.metricValue}>
            ${(meta?.totalMarginUSD ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={s.metricSub}>Margin locked across brokers</div>
        </div>

        <div className={s.metricCard}>
          <div className={s.metricLabel}>Total Running Lots</div>
          <div className={s.metricValue}>
            {(meta?.totalOpenVolume ?? 0).toFixed(2)}
          </div>
          <div className={s.metricSub}>Active contract volume</div>
        </div>
      </div>

      {/* ─── Filters & Controls ─── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        {/* Tab Buttons */}
        <div style={{ display: 'flex', background: 'var(--bg-surface)', padding: 4, borderRadius: 10, border: '1px solid var(--border-default)' }}>
          <button
            onClick={() => { setActiveTab('OPEN'); setPage(1) }}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'OPEN' ? '#60cdf6' : 'transparent',
              color: activeTab === 'OPEN' ? '#000' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Running ({meta?.openCount ?? 0})
          </button>
          <button
            onClick={() => { setActiveTab('CLOSED'); setPage(1) }}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'CLOSED' ? '#60cdf6' : 'transparent',
              color: activeTab === 'CLOSED' ? '#000' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Closed History ({meta?.closedCount ?? 0})
          </button>
          <button
            onClick={() => { setActiveTab('ALL'); setPage(1) }}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'ALL' ? '#60cdf6' : 'transparent',
              color: activeTab === 'ALL' ? '#000' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            All Positions
          </button>
        </div>

        {/* Search & Select Filters */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Broker Filter */}
          <select
            value={brokerFilter}
            onChange={(e) => { setBrokerFilter(e.target.value); setPage(1) }}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
            }}
          >
            <option value="ALL">All Brokers</option>
            {Array.isArray(brokers) && brokers.map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.companyName} ({b.email})
              </option>
            ))}
          </select>

          {/* Search Input */}
          <input
            type="text"
            placeholder="Search by client name, email, ID..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: 12,
              width: 240,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* ─── Positions Table ─── */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1200, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '14px 16px' }}>Position ID</th>
              <th style={{ padding: '14px 16px' }}>Broker</th>
              <th style={{ padding: '14px 16px' }}>Mode</th>
              <th style={{ padding: '14px 16px' }}>Client</th>
              <th style={{ padding: '14px 16px' }}>Symbol</th>
              <th style={{ padding: '14px 16px' }}>Side</th>
              <th style={{ padding: '14px 16px' }}>Volume (Lots)</th>
              <th style={{ padding: '14px 16px' }}>Open Price</th>
              <th style={{ padding: '14px 16px' }}>{activeTab === 'CLOSED' ? 'Close Price' : 'Live Price'}</th>
              <th style={{ padding: '14px 16px' }}>PnL ($)</th>
              <th style={{ padding: '14px 16px' }}>Margin ($)</th>
              <th style={{ padding: '14px 16px' }}>Status</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={13} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading trade positions...
                </td>
              </tr>
            ) : !Array.isArray(data?.data) || data.data.length === 0 ? (
              <tr>
                <td colSpan={13} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No trade positions found for selected filters.
                </td>
              </tr>
            ) : (
              data.data.map((pos) => {
                const isBuy = pos.side === 'BUY'
                const pnlVal = pos.status === 'OPEN' ? Number(pos.floatingPnl ?? 0) : Number(pos.closedPnl ?? pos.realizedPnl ?? pos.floatingPnl ?? 0)

                return (
                  <tr key={pos.id} style={{ borderBottom: '1px solid var(--border-default)', transition: 'background 150ms' }}>
                    <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {pos.id.slice(0, 8)}...
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {new Date(pos.openedAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{pos.broker?.companyName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pos.broker?.email}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          background: pos.mode === 'LIVE' ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.15)',
                          color: pos.mode === 'LIVE' ? '#10b981' : '#fbbf24',
                          border: `1px solid ${pos.mode === 'LIVE' ? 'rgba(16,185,129,0.3)' : 'rgba(251,191,36,0.3)'}`,
                          textTransform: 'uppercase'
                        }}
                      >
                        {pos.mode || 'DEMO'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{pos.client?.firstName} {pos.client?.lastName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pos.client?.email}</div>
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#60cdf6' }}>
                      {pos.symbol?.displayName || pos.symbol?.name}
                      {!isMarketOpen(pos.symbol?.name ?? '') && (
                        <div style={{ fontSize: 9, fontWeight: 500, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }}></span>
                          Market Closed
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 800,
                          background: isBuy ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: isBuy ? '#10b981' : '#ef4444',
                          border: `1px solid ${isBuy ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        }}
                      >
                        {pos.side}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {Number(pos.volume).toFixed(2)}
                    </td>
                    <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)' }}>
                      {Number(pos.openPrice).toFixed(pos.symbol?.digits ?? 2)}
                    </td>
                    <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)' }}>
                      {pos.status === 'CLOSED'
                        ? Number(pos.closePrice ?? pos.currentPrice ?? pos.openPrice).toFixed(pos.symbol?.digits ?? 2)
                        : Number(pos.currentPrice ?? pos.openPrice).toFixed(pos.symbol?.digits ?? 2)}
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: pnlVal >= 0 ? '#10b981' : '#ef4444',
                      }}
                    >
                      {pnlVal >= 0 ? `+$${pnlVal.toFixed(2)}` : `-$${Math.abs(pnlVal).toFixed(2)}`}
                    </td>
                    <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)' }}>
                      ${Number(pos.marginReservedUSD).toFixed(2)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {(() => {
                        const isOpen = pos.status === 'OPEN';
                        const isMktOpen = isMarketOpen(pos.symbol?.name ?? '');
                        
                        if (isOpen) {
                          if (isMktOpen) {
                            return (
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: 'rgba(96,205,246,0.15)',
                                  color: '#60cdf6',
                                  border: '1px solid rgba(96,205,246,0.3)',
                                  textTransform: 'uppercase'
                                }}
                              >
                                OPEN
                              </span>
                            );
                          } else {
                            return (
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: 'rgba(239,68,68,0.15)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239,68,68,0.3)',
                                  textTransform: 'uppercase'
                                }}
                              >
                                MKT CLOSED
                              </span>
                            );
                          }
                        } else {
                          return (
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 700,
                                background: 'rgba(156,163,175,0.15)',
                                color: '#9ca3af',
                                border: '1px solid rgba(156,163,175,0.3)',
                                textTransform: 'uppercase'
                              }}
                            >
                              {pos.status}
                            </span>
                          );
                        }
                      })()}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {pos.status === 'OPEN' ? (
                        <button
                          onClick={() => { setClosingPos(pos); setCloseError(null) }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid rgba(239,68,68,0.4)',
                            background: 'rgba(239,68,68,0.1)',
                            color: '#ef4444',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 150ms',
                          }}
                        >
                          Close Position
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Closed</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Pagination Footer ─── */}
      {data?.meta && data.meta.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Showing page {data.meta.page} of {data.meta.totalPages} ({data.meta.total} positions)
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: 12,
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <button
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: 12,
                cursor: page >= data.meta.totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= data.meta.totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ─── Close Position Modal ─── */}
      {closingPos && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-bg)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              background: 'var(--bg-surface)',
              borderRadius: 12,
              border: '1px solid var(--border-default)',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px 0', color: '#ef4444' }}>
              Confirm Admin Position Close
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Are you sure you want to close this running position immediately at market price?
            </p>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid var(--border-default)', fontSize: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Broker:</span>
                <span style={{ fontWeight: 600 }}>{closingPos.broker?.companyName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Client:</span>
                <span style={{ fontWeight: 600 }}>{closingPos.client?.firstName} {closingPos.client?.lastName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Instrument / Side:</span>
                <span style={{ fontWeight: 700, color: closingPos.side === 'BUY' ? '#10b981' : '#ef4444' }}>
                  {closingPos.symbol?.displayName} ({closingPos.side} {closingPos.volume} Lots)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Live Floating PnL:</span>
                <span style={{ fontWeight: 700, color: Number(closingPos.floatingPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                  ${Number(closingPos.floatingPnl ?? 0).toFixed(2)}
                </span>
              </div>
            </div>

            {closeError && (
              <div style={{ padding: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
                {closeError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setClosingPos(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border-default)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => closeMutation.mutate(closingPos.id)}
                disabled={closeMutation.isPending}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: closeMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: closeMutation.isPending ? 0.7 : 1,
                }}
              >
                {closeMutation.isPending ? 'Closing Position...' : 'Confirm & Close Position'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
