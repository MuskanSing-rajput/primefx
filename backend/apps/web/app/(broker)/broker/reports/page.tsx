'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Order, Position, TradingClient } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  AreaChart, Area, Tooltip, Legend
} from 'recharts'

async function fetchOrders(): Promise<{ data: Order[] }> {
  const res = await fetch('/api/orders', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as { data: { data: Order[] } }
  return body.data
}
async function fetchPositions(): Promise<Position[]> {
  const res = await fetch('/api/positions', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as { data: Position[] }
  return body.data
}
async function fetchClients(): Promise<{ data: TradingClient[] }> {
  const res = await fetch('/api/clients', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as { data: { data: TradingClient[] } }
  return body.data
}

async function fetchRevenueSummary(from?: string) {
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  const res = await fetch(`/api/reports/revenue?${qs.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as any
  return body.data ?? body
}

// Aggregate orders by symbol
function groupBySymbol(orders: Order[]) {
  const map: Record<string, { symbol: string; filled: number; rejected: number; volume: number }> = {}
  orders.forEach(o => {
    const sym = (o as any).symbol?.name ?? 'Unknown'
    if (!map[sym]) map[sym] = { symbol: sym, filled: 0, rejected: 0, volume: 0 }
    if (o.status === 'FILLED')   { map[sym].filled++;   map[sym].volume += Number(o.requestedVolume) }
    if (o.status === 'REJECTED')   map[sym].rejected++
  })
  return Object.values(map).sort((a, b) => b.volume - a.volume).slice(0, 8)
}

// Build dynamic cumulative PnL series from positions based on period (7D, 30D, 90D)
function buildPnlSeries(positions: Position[], period: '7D' | '30D' | '90D') {
  const numDays = period === '7D' ? 7 : period === '30D' ? 30 : 90
  
  // Generate the array of dates for the period
  const dateObjs = Array.from({ length: numDays }, (_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (numDays - 1 - i))
    return d
  })

  // Format the date keys to map positions
  const days = dateObjs.map(d => ({
    dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    timestamp: d.getTime(),
  }))

  // Filter and sort closed positions chronologically by closedAt
  const closedPositions = positions
    .filter(p => p.status === 'CLOSED' && p.closedAt)
    .map(p => ({
      closedAt: p.closedAt ? new Date(p.closedAt) : new Date(),
      closedPnl: Number(p.closedPnl ?? p.floatingPnl ?? 0),
    }))
    .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())

  // Calculate cumulative PnL for each day up to that date
  const firstDate = dateObjs[0]
  const startPeriodTimestamp = firstDate ? firstDate.getTime() : 0
  const pnlBeforePeriod = closedPositions
    .filter(p => p.closedAt.getTime() < startPeriodTimestamp)
    .reduce((sum, p) => sum + p.closedPnl, 0)
  
  let cumulative = pnlBeforePeriod

  return days.map(day => {
    // Add all PnL realized on this specific day
    const dayEndTimestamp = day.timestamp + 24 * 60 * 60 * 1000
    const dayPnl = closedPositions
      .filter(p => p.closedAt.getTime() >= day.timestamp && p.closedAt.getTime() < dayEndTimestamp)
      .reduce((sum, p) => sum + p.closedPnl, 0)
    
    cumulative += dayPnl
    return {
      name: day.dateStr,
      pnl: parseFloat(cumulative.toFixed(2)),
    }
  })
}

const TOOLTIP_STYLE = {
  background: 'var(--card-bg)', border: '1px solid var(--card-border)',
  borderRadius: 8, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
}

export default function BrokerReportsPage() {
  const [period, setPeriod] = useState<'7D' | '30D' | '90D'>('7D')

  const { data: ordersData, isLoading: ordersLoading } = useQuery({ queryKey: ['orders','reports'], queryFn: fetchOrders })
  const { data: positions, isLoading: posLoading }     = useQuery({ queryKey: ['positions','reports'], queryFn: fetchPositions })
  const { data: clientsData }                           = useQuery({ queryKey: ['clients','reports'], queryFn: fetchClients })
  const { data: revenueSummary }                       = useQuery({ queryKey: ['reports','revenue','broker'], queryFn: () => fetchRevenueSummary() })

  const orders   = ordersData?.data   ?? []
  const clients  = clientsData?.data  ?? []
  const posArr   = positions           ?? []

  const filled   = orders.filter(o => o.status === 'FILLED').length
  const rejected = orders.filter(o => o.status === 'REJECTED').length
  const fillRate = orders.length > 0 ? ((filled / orders.length) * 100).toFixed(1) : '0.0'
  const totalVol = posArr.reduce((a, p) => a + parseFloat(p.volume), 0)
  const closedPnl= posArr.filter(p => p.status === 'CLOSED').reduce((a, p) => a + Number(p.closedPnl ?? p.floatingPnl ?? 0), 0)
  const totalComm= (positions ?? []).reduce((a, p) => a + parseFloat(p.commission), 0)

  const symbolData = useMemo(() => groupBySymbol(orders), [orders])
  const pnlSeries  = useMemo(() => buildPnlSeries(posArr, period), [posArr, period])

  const isLoading = ordersLoading || posLoading

  const handleExport = () => {
    const rows = [
      ['Symbol', 'Side', 'Volume', 'Status', 'Time'],
      ...orders.map(o => [(o as any).symbol?.name ?? '—', o.side, o.requestedVolume, o.status, o.createdAt]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `lp-report-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* ─── Header ─── */}
      <div className={s.pageHeader} style={{ justifyContent: 'flex-end' }}>
        <div className={s.pageActions}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--item-hover)', border: '1px solid var(--card-border)', borderRadius: 8, padding: 3 }}>
            {(['7D','30D','90D'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                height: 28, padding: '0 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: period === p ? 'var(--btn-active-bg)' : 'none',
                color: period === p ? 'var(--btn-active-color)' : 'var(--text-muted)', transition: 'all 150ms',
              }}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── KPI stat cards ─── */}
      <div className={s.statGrid} style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 20 }}>
        <div className={`${s.statCard} ${s.statCardAccentTeal}`}>
          <div className={s.statLabel}>Total Orders</div>
          <div className={s.statValue}>{isLoading ? '—' : orders.length}</div>
        </div>
        <div className={`${s.statCard} ${s.statCardAccentGreen}`}>
          <div className={s.statLabel}>Fill Rate</div>
          <div className={s.statValue} style={{ color: 'var(--text-success)' }}>{isLoading ? '—' : `${fillRate}%`}</div>
        </div>
        <div className={`${s.statCard} ${s.statCardAccentRed}`}>
          <div className={s.statLabel}>Rejections</div>
          <div className={s.statValue} style={{ color: 'var(--text-danger)' }}>{isLoading ? '—' : rejected}</div>
        </div>
        <div className={`${s.statCard} ${s.statCardAccentMag}`}>
          <div className={s.statLabel}>Total Volume</div>
          <div className={s.statValue} style={{ fontSize: 18 }}>{isLoading ? '—' : `${totalVol.toFixed(2)} lots`}</div>
        </div>
        <div className={`${s.statCard} ${closedPnl >= 0 ? s.statCardAccentGreen : s.statCardAccentRed}`}>
          <div className={s.statLabel}>Closed PnL</div>
          <div className={s.statValue} style={{ color: closedPnl >= 0 ? 'var(--text-success)' : 'var(--text-danger)', fontSize: 20 }}>
            {closedPnl >= 0 ? '+' : ''}${Math.abs(closedPnl).toFixed(2)}
          </div>
        </div>
      </div>

      {/* ─── Charts row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>

        {/* PnL trend line chart */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}>P&amp;L Trend ({period})</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: closedPnl >= 0 ? '#10b981' : '#ef4444', fontFamily: 'var(--font-mono)' }}>
              {closedPnl >= 0 ? '+' : ''}${Math.abs(closedPnl).toFixed(0)}
            </span>
          </div>
          <div className={s.cardBody} style={{ paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={pnlSeries} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="pnlGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line-color)" vertical={false}/>
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`}/>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`$${v}`, 'PnL']}/>
                <Area type="monotone" dataKey="pnl" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#pnlGlow)" dot={{ fill: '#3b82f6', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#3b82f6' }}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Volume by symbol bar chart */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}>Volume by Symbol</span>
            <span className={`${s.chip} ${s.chipNeutral}`}>{symbolData.length} instruments</span>
          </div>
          <div className={s.cardBody} style={{ paddingTop: 0 }}>
            {isLoading || symbolData.length === 0 ? (
              <div className={s.emptyState} style={{ height: 180 }}>
                {isLoading ? <div className={s.spinner}/> : <div className={s.emptyText}>No order data yet</div>}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={symbolData} margin={{ top: 12, right: 12, bottom: 0, left: -20 }} barGap={6}>
                  <defs>
                    <linearGradient id="filledGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.75}/>
                    </linearGradient>
                    <linearGradient id="rejectedGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={0.75}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line-color)" vertical={false}/>
                  <XAxis dataKey="symbol" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} allowDecimals={false}/>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
                    formatter={(v: any, name: any) => [v, name === 'Filled' || name === 'filled' ? 'Filled Orders' : 'Rejected Orders']}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', paddingTop: 6 }}/>
                  <Bar dataKey="filled" name="Filled" fill="url(#filledGlow)" radius={[4, 4, 0, 0]} maxBarSize={28}/>
                  <Bar dataKey="rejected" name="Rejected" fill="url(#rejectedGlow)" radius={[4, 4, 0, 0]} maxBarSize={28}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ─── Summary table row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Symbol breakdown table */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}>Symbol Breakdown</span>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Symbol</th>
                  <th style={{ textAlign: 'right', width: '22%' }}>Filled</th>
                  <th style={{ textAlign: 'right', width: '22%' }}>Rejected</th>
                  <th style={{ textAlign: 'right', width: '26%' }}>Volume (lots)</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={4}><div className={s.emptyState}><div className={s.spinner}/></div></td></tr>
                ) : symbolData.length === 0 ? (
                  <tr><td colSpan={4}><div className={s.emptyState}><div className={s.emptyText}>No data</div></div></td></tr>
                ) : symbolData.map(row => (
                  <tr key={row.symbol}>
                    <td className={s.tableMono} style={{ fontWeight: 700, color: 'var(--text-primary)', textAlign: 'left' }}>{row.symbol}</td>
                    <td className={s.tableMono} style={{ color: '#10b981', textAlign: 'right' }}>{row.filled}</td>
                    <td className={s.tableMono} style={{ color: row.rejected > 0 ? '#ef4444' : 'var(--text-muted)', textAlign: 'right' }}>{row.rejected}</td>
                    <td className={s.tableMono} style={{ textAlign: 'right' }}>{row.volume.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Client activity table */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}>Client Activity</span>
            <span className={`${s.chip} ${s.chipNeutral}`}>{clients.length} clients</span>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>Client</th><th>Type</th><th>CCY</th><th>Leverage</th><th className={s.center}>Status</th></tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr><td colSpan={5}><div className={s.emptyState}><div className={s.emptyText}>No clients registered</div></div></td></tr>
                ) : clients.slice(0, 8).map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13 }}>{c.firstName} {c.lastName}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.externalClientId}</div>
                    </td>
                    <td><span className={`${s.chip} ${s.chipNeutral}`} style={{ fontSize: 9 }}>{c.accountType?.toUpperCase()}</span></td>
                    <td className={s.tableMono}>{c.currency}</td>
                    <td className={s.tableMono}>1:{c.leverage}</td>
                    <td className={s.center}>
                      <span className={`${s.chip} ${c.isActive ? s.chipGreen : s.chipNeutral}`}><span className={s.chipDot}/>{c.isActive ? 'Active' : 'Off'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── Commission summary ─── */}
      <div className={s.card} style={{ marginTop: 14 }}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>Commission Summary</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Space Grotesk',sans-serif" }}>
            ${totalComm.toFixed(2)}
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>total earned</span>
          </span>
        </div>
        <div className={s.cardBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              { label: 'Per Trade Avg',   value: orders.length > 0 ? `$${(totalComm / Math.max(orders.length, 1)).toFixed(2)}` : '$0.00', color: '#3b82f6' },
              { label: 'Spread Revenue',  value: `$${revenueSummary?.summary?.totalSpreadMarkupRevenue ?? (totalVol * 3.5).toFixed(2)}`, color: '#e879f9' },
              { label: 'Active Clients',  value: `${clients.filter(c => c.isActive).length}`, color: '#22c55e' },
              { label: 'Fill Rate',       value: `${fillRate}%`, color: '#fbbf24' },
            ].map(item => (
              <div key={item.label} style={{ padding: '14px 16px', background: 'var(--item-hover)', borderRadius: 10, border: '1px solid var(--card-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.color, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: '-0.02em' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
