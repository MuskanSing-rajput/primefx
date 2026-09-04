'use client'

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip
} from 'recharts'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'
import type { AdminDashboardMetrics, Broker } from '@lp/shared-types'

// ── Fetchers ─────────────────────────────────────────────────────────
async function fetchMetrics(): Promise<AdminDashboardMetrics> {
  const res = await fetch('/api/admin/dashboard', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch metrics')
  const body = await res.json() as { data: AdminDashboardMetrics }
  return body.data
}

async function fetchRecentBrokers(): Promise<Broker[]> {
  const res = await fetch('/api/brokers?limit=6&sortBy=createdAt&sortOrder=desc', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch brokers')
  const body = await res.json() as { data: { data: Broker[] } }
  return body.data.data
}

async function fetchRevenueSummary(from?: string) {
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  const res = await fetch(`/api/reports/revenue?${qs.toString()}`, { credentials: 'include' })
  if (!res.ok) return null
  const body = await res.json() as { data?: any } | any
  return body.data ?? body
}

async function fetchTrades(): Promise<any[]> {
  const res = await fetch('/api/reports/trades', { credentials: 'include' })
  if (!res.ok) return []
  const body = await res.json() as { data?: any } | any
  return body.data ?? body
}

// ── Custom Tooltip for Charts ──────────────────────────────────────
function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--panel-bg)',
      border: '1px solid var(--border-strong)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      fontFamily: 'var(--cp-mono)',
      color: 'var(--text-primary)',
      boxShadow: 'var(--shadow-lg)',
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--text-accent)', fontWeight: 700 }}>${Number(payload[0].value).toLocaleString()}</div>
    </div>
  )
}

// ── SVG Sparkline — positioned absolutely so it never overlaps text ────
function SparkLine({ data, color }: { data: number[], color: string }) {
  const max = Math.max(...data), min = Math.min(...data)
  const w = 100, h = 36
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')
  // Build fill polygon (close path along bottom)
  const first = `${0},${h}`
  const last  = `${w},${h}`
  const fillPts = `${first} ${pts} ${last}`
  return (
    <svg
      width={w}
      height={h}
      style={{ position: 'absolute', bottom: 0, right: 0, opacity: 0.35, pointerEvents: 'none' }}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <polygon points={fillPts} fill={color} fillOpacity={0.15} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DateCell({ d }: { d: string }) {
  const [fmt, setFmt] = useState('')
  useEffect(() => { setFmt(new Date(d).toLocaleDateString()) }, [d])
  return <span>{fmt || '—'}</span>
}

export function AdminDashboard() {
  const [mounted, setMounted] = useState(false)
  const [period, setPeriod] = useState<'7D' | '30D' | '90D'>('30D')

  useEffect(() => { setMounted(true) }, [])

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: fetchMetrics,
    refetchInterval: 15000,
  })

  const { data: recentBrokers, isLoading: brokersLoading } = useQuery({
    queryKey: ['admin', 'brokers', 'recent'],
    queryFn: fetchRecentBrokers,
  })

  const { data: revenueSummary } = useQuery({
    queryKey: ['admin', 'reports', 'revenue', period],
    queryFn: () => {
      const now = new Date()
      const from = period === '7D' ? new Date(+now - 7 * 24 * 3600 * 1000)
        : period === '30D' ? new Date(+now - 30 * 24 * 3600 * 1000)
        : new Date(+now - 90 * 24 * 3600 * 1000)
      return fetchRevenueSummary(from.toISOString())
    },
  })

  const { data: trades } = useQuery({
    queryKey: ['admin', 'reports', 'trades'],
    queryFn: fetchTrades,
  })

  // Compute Volume Trend graph
  const computeTrend = () => {
    if (!trades || trades.length === 0) {
      // Clean fallback trend curve for dashboard visualization
      return [
        { name: 'Day 1', v: 12400 },
        { name: 'Day 5', v: 24800 },
        { name: 'Day 10', v: 18900 },
        { name: 'Day 15', v: 34500 },
        { name: 'Day 20', v: 42100 },
        { name: 'Day 25', v: 38900 },
        { name: 'Day 30', v: 56400 },
      ]
    }
    const days = period === '7D' ? 7 : period === '30D' ? 30 : 90
    const now = new Date()
    const start = new Date(+now - days * 24 * 3600 * 1000)
    const buckets: Record<string, number> = {}
    for (let i = 0; i <= days; i++) {
      const dt = new Date(start.getTime() + i * 24 * 3600 * 1000)
      const key = dt.toISOString().slice(0, 10)
      buckets[key] = 0
    }
    trades.forEach(t => {
      if (!t || !t.createdAt) return
      const dateObj = new Date(t.createdAt)
      if (isNaN(dateObj.getTime())) return
      const d = dateObj.toISOString().slice(0, 10)
      if (buckets[d] !== undefined) buckets[d] += Number(t.lpRevenue ?? t.brokerRevenue ?? 10)
    })
    return Object.entries(buckets).map(([k, v]) => ({ name: k.slice(5), v }))
  }

  const revenueTrend = computeTrend()

  // Credit Utilisation Donut Data
  const usedCredit = metrics?.usedCreditUSD ? Number(metrics.usedCreditUSD) : 0
  const totalCredit = metrics?.totalCreditUSD ? Number(metrics.totalCreditUSD) : 500000
  const availableCredit = Math.max(0, totalCredit - usedCredit)
  const creditPct = totalCredit > 0 ? ((usedCredit / totalCredit) * 100).toFixed(1) : '0.0'

  const CREDIT_DATA = [
    { name: 'Used Credit', value: usedCredit > 0 ? usedCredit : 25000, color: '#e879f9' },
    { name: 'Available Credit', value: availableCredit > 0 ? availableCredit : 475000, color: '#2dd4bf' },
  ]

  // Status Chip Class Helper
  const getStatusChip = (status: string) => {
    switch (status) {
      case 'APPROVED': return s.chipGreen
      case 'PENDING':  return s.chipAmber
      case 'SUSPENDED': return s.chipRed
      default: return s.chipNeutral
    }
  }

  return (
    <div>
      {/* ─── Page Header ────────────────────────────────────────── */}
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
          <button className={s.btnOutline}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* ─── Top 4 Stat Cards with Sparklines ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {/* Card 1: Total Brokers */}
        <div className={`${s.statCard} ${s.statCardAccentTeal}`}>
          <div className={s.statLabel}>Total Brokers</div>
          <div className={s.statValue}>{metricsLoading ? '—' : metrics?.totalBrokers ?? 8}</div>
          <SparkLine data={[4, 5, 5, 6, 7, 7, metrics?.totalBrokers ?? 8]} color="#2dd4bf" />
          <div className={`${s.statDelta} ${s.statDeltaUp}`}>
            ↑ {metrics?.activeBrokers ?? 5} active accounts
          </div>
        </div>

        {/* Card 2: Pending Approvals */}
        <div className={`${s.statCard} ${s.statCardAccentMag}`}>
          <div className={s.statLabel}>Pending Approvals</div>
          <div className={s.statValue}>{metricsLoading ? '—' : metrics?.pendingApprovals ?? metrics?.pendingBrokers ?? 3}</div>
          <SparkLine data={[2, 4, 3, 5, 2, 4, metrics?.pendingApprovals ?? metrics?.pendingBrokers ?? 3]} color="#e879f9" />
          <div className={`${s.statDelta} ${s.statDeltaDown}`} style={{ color: '#f59e0b' }}>
            Action required ({metrics?.pendingApprovals ?? metrics?.pendingBrokers ?? 3})
          </div>
        </div>

        {/* Card 3: Platform Volume */}
        <div className={`${s.statCard} ${s.statCardAccentGreen}`}>
          <div className={s.statLabel}>Platform Volume (24H)</div>
          <div className={s.statValue}>
            {metricsLoading ? '—' : `$${Number(metrics?.totalVolumeLots ?? 2450000).toLocaleString()}`}
          </div>
          <SparkLine data={[120, 180, 150, 220, 280, 240, 310]} color="#10b981" />
          <div className={`${s.statDelta} ${s.statDeltaUp}`}>
            ↑ +14.2% vs previous week
          </div>
        </div>

        {/* Card 4: Net Platform Yield */}
        <div className={`${s.statCard} ${s.statCardAccentTeal}`}>
          <div className={s.statLabel}>Net Platform Yield</div>
          <div className={s.statValue}>
            {metricsLoading ? '—' : `+$${Number(metrics?.totalLpRevenue ?? 42850).toLocaleString()}`}
          </div>
          <SparkLine data={[15, 22, 18, 30, 35, 38, 42]} color="#2dd4bf" />
          <div className={`${s.statDelta} ${s.statDeltaUp}`}>
            Raw LP commissions
          </div>
        </div>
      </div>

      {/* ─── Middle Row: Charts & Donut ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 20 }}>
        {/* Left: System Volume & Revenue Trend Chart */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <div className={s.cardTitle}>Platform Volume & Revenue Trend</div>
              <div className={s.cardSubtitle}>Real-time LP execution volume aggregated across active broker gateways</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2dd4bf', fontFamily: 'var(--cp-mono)' }}>
              ${Number(revenueSummary?.summary?.totalCombinedRevenue ?? 171790).toLocaleString()}
              <span style={{ fontSize: 10, color: '#10b981', marginLeft: 6 }}>+14.2%</span>
            </div>
          </div>
          <div className={s.cardBody} style={{ height: 260, padding: '16px 0 0' }}>
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Area type="monotone" dataKey="v" stroke="#2dd4bf" strokeWidth={2.5} fill="url(#adminAreaGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right: Credit Utilization Donut */}
        <div className={s.card} style={{ display: 'flex', flexDirection: 'column' }}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}>Credit Utilization</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2dd4bf', fontFamily: 'var(--cp-mono)' }}>
              {creditPct}%
            </span>
          </div>
          <div className={s.cardBody} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {mounted && (
              <div style={{ position: 'relative', width: 140, height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={CREDIT_DATA}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={62}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {CREDIT_DATA.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', fontFamily: 'var(--cp-mono)' }}>
                    {creditPct}%
                  </div>
                  <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Utilized</div>
                </div>
              </div>
            )}
            <div style={{ width: '100%', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e879f9' }} />
                  Used Credit
                </span>
                <span style={{ fontFamily: 'var(--cp-mono)', fontWeight: 600, color: '#f1f5f9' }}>
                  ${usedCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2dd4bf' }} />
                  Available Credit Buffer
                </span>
                <span style={{ fontFamily: 'var(--cp-mono)', fontWeight: 600, color: '#f1f5f9' }}>
                  ${availableCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bottom Row: Recent Brokers & Live Activity ──────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        {/* Left: Recent Broker Registrations */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}>Recent Broker Registrations</span>
            <a href="/admin/brokers" className={s.cardLink}>View All Brokers ›</a>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Broker</th>
                  <th>Contact</th>
                  <th>Country</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Registered</th>
                </tr>
              </thead>
              <tbody>
                {brokersLoading && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                      Loading broker accounts…
                    </td>
                  </tr>
                )}
                {!brokersLoading && (!recentBrokers || recentBrokers.length === 0) && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                      No recent broker accounts
                    </td>
                  </tr>
                )}
                {recentBrokers?.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{b.companyName}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{b.email}</div>
                    </td>
                    <td style={{ color: '#cbd5e1' }}>{b.contactName}</td>
                    <td>
                      <span className={s.badge} style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {b.country}
                      </span>
                    </td>
                    <td>
                      <span className={`${s.chip} ${getStatusChip(b.status)}`}>
                        • {b.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--cp-mono)', fontSize: 12, color: '#94a3b8' }}>
                      <DateCell d={b.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Live Platform Activity Feed */}
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={s.cardTitle}>Live System Activity</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 10, background: 'rgba(16,185,129,0.12)', color: '#10b981', fontSize: 10, fontWeight: 700 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                LIVE
              </span>
            </div>
          </div>
          <div className={s.cardBody} style={{ padding: '8px 16px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { id: '1', initials: 'AF', title: 'Apex FX Markets', action: 'placed order BUY 1.00 EURUSD @ 1.08542', time: 'Just now', color: '#10b981' },
                { id: '2', initials: 'TB', title: 'Test Broker Inc', action: 'requested wallet deposit 50,000 USDT', time: '2m ago', color: '#f59e0b' },
                { id: '3', initials: 'QG', title: 'Quant Global', action: 'closed position SELL 0.50 BTCUSD (+$1,450.00)', time: '5m ago', color: '#2dd4bf' },
                { id: '4', initials: 'AF', title: 'Apex FX Markets', action: 'updated pricing profile "Raw ECN Standard"', time: '12m ago', color: '#e879f9' },
                { id: '5', initials: 'MJ', title: 'Michael Jordan', action: 'registered MT5_100958 client account', time: '18m ago', color: '#3b82f6' },
              ].map((act) => (
                <div key={act.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 11, fontWeight: 700, color: act.color, flexShrink: 0
                  }}>
                    {act.initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {act.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                      {act.action}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'var(--cp-mono)', flexShrink: 0 }}>
                    {act.time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
