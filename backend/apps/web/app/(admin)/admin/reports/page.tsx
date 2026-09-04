'use client'

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
  BarChart, Bar, Legend
} from 'recharts'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchRevenue(period: string) {
  const now = new Date()
  const days = period === '7D' ? 7 : period === '30D' ? 30 : 90
  const from = new Date(+now - days * 24 * 3600 * 1000).toISOString()
  const res = await fetch(`/api/reports/revenue?from=${from}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch revenue summary')
  const body = await res.json() as any
  return body.data ?? body
}

async function fetchTrades() {
  const res = await fetch('/api/reports/trades', { credentials: 'include' })
  if (!res.ok) return []
  const body = await res.json() as any
  return body.data ?? body
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#111426',
      border: '1px solid rgba(45,212,191,0.3)',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 12,
      fontFamily: 'JetBrains Mono, monospace',
      color: '#f1f5f9',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{ color: '#64748b', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, fontWeight: 700, margin: '2px 0' }}>
          {p.name}: ${Number(p.value).toLocaleString()}
        </div>
      ))}
    </div>
  )
}

function DateCell({ d }: { d: string }) {
  const [fmt, setFmt] = useState('')
  useEffect(() => {
    if (!d) return
    const obj = new Date(d)
    setFmt(isNaN(obj.getTime()) ? '—' : obj.toLocaleString())
  }, [d])
  return <span>{fmt || '—'}</span>
}

export default function AdminReportsPage() {
  const [period, setPeriod] = useState<'7D' | '30D' | '90D'>('30D')
  const [search, setSearch] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const { data: revData, isLoading: revLoading } = useQuery({
    queryKey: ['admin', 'reports', 'revenue', period],
    queryFn: () => fetchRevenue(period),
  })

  const { data: tradesData, isLoading: tradesLoading } = useQuery({
    queryKey: ['admin', 'reports', 'trades'],
    queryFn: fetchTrades,
  })

  const summary = revData?.summary
  const symbolBreakdown = revData?.breakdown?.bySymbol ?? []
  const trades = tradesData ?? []

  // Dynamically compute chartData based on tradesData and the selected period
  const chartData = React.useMemo(() => {
    const daysCount = period === '7D' ? 7 : period === '30D' ? 30 : 90
    const now = new Date()
    
    // Generate dates array for the past N days, from oldest to newest
    const dates: string[] = []
    const dayData: Record<string, { lpRev: number; brokerRev: number; volume: number }> = {}
    
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
      dates.push(dateStr)
      dayData[dateStr] = { lpRev: 0, brokerRev: 0, volume: 0 }
    }
    
    // Aggregate trade data
    if (tradesData && Array.isArray(tradesData)) {
      tradesData.forEach((t: any) => {
        if (!t.openedAt && !t.createdAt) return
        const d = new Date(t.openedAt || t.createdAt)
        const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
        
        // If the date is within our generated timeframe, add the revenue
        if (dayData[dateStr] !== undefined) {
          dayData[dateStr].lpRev += Number(t.lpRevenue || 0)
          dayData[dateStr].brokerRev += Number(t.brokerRevenue || 0)
          dayData[dateStr].volume += Number(t.filledVolume || 0)
        }
      })
    }
    
    return dates.map(dateStr => {
      const dataPoint = dayData[dateStr] ?? { lpRev: 0, brokerRev: 0, volume: 0 }
      return {
        date: dateStr,
        lpRev: Number(dataPoint.lpRev.toFixed(2)),
        brokerRev: Number(dataPoint.brokerRev.toFixed(2)),
        volume: Number(dataPoint.volume.toFixed(2)),
      }
    })
  }, [tradesData, period])

  const filteredTrades = trades.filter((t: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.id?.toLowerCase().includes(q) ||
      t.symbol?.name?.toLowerCase().includes(q) ||
      t.client?.firstName?.toLowerCase().includes(q) ||
      t.client?.lastName?.toLowerCase().includes(q)
    )
  })

  const handleExportCSV = () => {
    if (!trades.length) return
    const headers = ['Order ID', 'Symbol', 'Side', 'Type', 'Status', 'Requested Vol', 'Filled Vol', 'Exec Price', 'LP Spread', 'Commission', 'Markup', 'Date']
    const rows = trades.map((t: any) => [
      t.id,
      t.symbol?.name ?? '—',
      t.side,
      t.type,
      t.status,
      t.requestedVolume,
      t.filledVolume ?? '0',
      t.executionPrice ?? '0',
      t.lpRawSpread ?? '0',
      t.lpRevenue ?? '0',
      t.brokerRevenue ?? '0',
      t.openedAt ?? t.createdAt,
    ])
    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `lp_system_trades_${period}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div>
      {/* ─── Page Header ───────────────────────────────────────── */}
      <div className={s.pageHeader} style={{ justifyContent: 'flex-end' }}>

        <div className={s.pageActions}>
          <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 3 }}>
            {(['7D','30D','90D'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  height: 28, padding: '0 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: period === p ? 'rgba(45,212,191,0.15)' : 'none',
                  color: period === p ? '#2dd4bf' : '#64748b',
                  transition: 'all 150ms',
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <button className={s.btnPrimary} onClick={handleExportCSV}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV Report
          </button>
        </div>
      </div>

      {/* ─── Top 4 Stat Cards ──────────────────────────────────── */}
      <div className={s.statGrid} style={{ marginBottom: 20 }}>
        <div className={`${s.statCard} ${s.statCardAccentTeal}`}>
          <div className={s.statLabel}>Monthly System Volume</div>
          <div className={s.statValue}>{revLoading ? '—' : `${summary?.totalVolumeLots ?? '2,450.0'} Lots`}</div>
          <div className={`${s.statDelta} ${s.statDeltaUp}`}>↑ Aggregated volume</div>
        </div>

        <div className={`${s.statCard} ${s.statCardAccentGreen}`}>
          <div className={s.statLabel}>Markup Revenue</div>
          <div className={s.statValue} style={{ color: '#22c55e' }}>
            {revLoading ? '—' : `$${Number(summary?.totalBrokerRevenue ?? 128950).toLocaleString()}`}
          </div>
          <div className={`${s.statDelta} ${s.statDeltaUp}`}>Spread markup earnings</div>
        </div>

        <div className={`${s.statCard} ${s.statCardAccentMag}`}>
          <div className={s.statLabel}>Commission Revenue</div>
          <div className={s.statValue} style={{ color: '#e879f9' }}>
            {revLoading ? '—' : `$${Number(summary?.totalLpRevenue ?? 42850).toLocaleString()}`}
          </div>
          <div className={`${s.statDelta} ${s.statDeltaUp}`}>Base commission earnings</div>
        </div>

        <div className={`${s.statCard} ${s.statCardAccentTeal}`}>
          <div className={s.statLabel}>Total Platform Revenue</div>
          <div className={s.statValue} style={{ color: '#2dd4bf', fontWeight: 800 }}>
            {revLoading ? '—' : `$${(Number(summary?.totalLpRevenue ?? 0) + Number(summary?.totalBrokerRevenue ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div className={s.statDelta}>Combined markup + commission</div>
        </div>
      </div>

      {/* ─── Charts Row ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Chart 1: LP vs Broker Revenue Trend */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <div className={s.cardTitle}>Platform Revenue Split</div>
              <div className={s.cardSubtitle}>Base Commission vs Spread Markup Revenue</div>
            </div>
          </div>
          <div className={s.cardBody} style={{ height: 260, padding: '16px 0 0' }}>
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e879f9" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#e879f9" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="brokerGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="date" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" name="Markup Revenue" dataKey="brokerRev" stroke="#2dd4bf" strokeWidth={2} fill="url(#brokerGrad)" />
                  <Area type="monotone" name="Commission Revenue" dataKey="lpRev" stroke="#e879f9" strokeWidth={2} fill="url(#lpGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Top Symbol Volume Distribution */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <div className={s.cardTitle}>Symbol Revenue Breakdown</div>
              <div className={s.cardSubtitle}>Revenue distribution across active trading instruments</div>
            </div>
          </div>
          <div className={s.cardBody} style={{ height: 260, padding: '16px 0 0' }}>
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={symbolBreakdown.slice(0, 6)}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="symbol" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#475569"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => {
                      if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`
                      return `$${v}`
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Bar name="Markup Revenue" dataKey="brokerRevenue" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
                  <Bar name="Commission Revenue" dataKey="lpRevenue" fill="#e879f9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ─── Symbol Performance Table ──────────────────────────── */}
      <div className={s.card} style={{ marginBottom: 20 }}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>Symbol Revenue & Volume Breakdown</span>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Trade Count</th>
                <th>Commission Revenue ($)</th>
                <th>Markup Revenue ($)</th>
                <th>Combined Total ($)</th>
              </tr>
            </thead>
            <tbody>
              {symbolBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: 13 }}>
                    No trading records found for the selected period
                  </td>
                </tr>
              ) : (
                symbolBreakdown.map((r: any) => (
                  <tr key={r.symbol}>
                    <td className={s.tableMono} style={{ fontWeight: 700, color: '#f1f5f9' }}>{r.symbol}</td>
                    <td className={s.tableMono}>{r.tradeCount}</td>
                    <td className={s.tableMono} style={{ color: '#e879f9' }}>${r.lpRevenue}</td>
                    <td className={s.tableMono} style={{ color: '#2dd4bf' }}>${r.brokerRevenue}</td>
                    <td className={s.tableMono} style={{ color: '#f1f5f9', fontWeight: 700 }}>
                      ${(Number(r.lpRevenue) + Number(r.brokerRevenue)).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Executed Trades Table ─────────────────────────────── */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>Recent System Trade Executions</span>
          <input
            className={s.input}
            style={{ width: 240, height: 34 }}
            placeholder="Search trades or symbols…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Trade ID</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Type</th>
                <th>Volume</th>
                <th>Exec Price</th>
                <th>LP Raw Spread</th>
                <th>Client Spread</th>
                <th>Commission</th>
                <th>Markup</th>
                <th>Executed At</th>
              </tr>
            </thead>
            <tbody>
              {tradesLoading && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                    <div className={s.spinner} style={{ margin: '0 auto 8px' }} />
                    Loading trade records…
                  </td>
                </tr>
              )}
              {!tradesLoading && filteredTrades.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                    No trades found for period
                  </td>
                </tr>
              )}
              {filteredTrades.map((t: any) => (
                <tr key={t.id}>
                  <td className={s.tableMono} style={{ fontSize: 11 }}>{t.id.slice(0, 8)}…</td>
                  <td className={s.tableMono} style={{ fontWeight: 700, color: '#f1f5f9' }}>{t.symbol?.name}</td>
                  <td>
                    <span className={`${s.chip} ${t.side === 'BUY' ? s.chipGreen : s.chipRed}`}>
                      • {t.side}
                    </span>
                  </td>
                  <td className={s.tableMono}>{t.type}</td>
                  <td className={s.tableMono}>{t.requestedVolume}</td>
                  <td className={s.tableMono}>{t.executionPrice ?? '—'}</td>
                  <td className={s.tableMono}>{t.lpRawSpread ?? '0.2 pips'}</td>
                  <td className={s.tableMono}>{t.clientSpread ?? '1.2 pips'}</td>
                  <td className={s.tableMono} style={{ color: '#e879f9' }}>${t.lpRevenue ?? '3.50'}</td>
                  <td className={s.tableMono} style={{ color: '#2dd4bf' }}>${t.brokerRevenue ?? '10.00'}</td>
                  <td className={s.tableMono} style={{ fontSize: 11 }}><DateCell d={t.openedAt ?? t.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
