'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts'
import {
  Eye,
  EyeOff,
  AlertCircle,
  TrendingUp,
  Activity,
  Users,
  Briefcase,
  ChevronRight,
  Download,
  Wallet,
  ArrowUpRight,
  Send,
  Plus,
  CreditCard,
  QrCode,
  History,
} from 'lucide-react'
import s from './BrokerDashboard.module.css'
import type { WalletSummary, Position, Order, TradingClient } from '@lp/shared-types'

// ── Fetchers ─────────────────────────────────────────────────────────
async function fetchWallet(): Promise<WalletSummary> {
  const res = await fetch('/api/wallet', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch wallet')
  const body = (await res.json()) as { data: WalletSummary }
  return body.data
}

async function fetchPositions(): Promise<Position[]> {
  const res = await fetch('/api/positions?status=OPEN', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch positions')
  const body = (await res.json()) as { data: Position[] }
  return body.data
}

async function fetchRecentOrders(): Promise<Order[]> {
  const res = await fetch('/api/orders', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch orders')
  const body = (await res.json()) as { data: { data: Order[] } }
  return body.data.data?.slice(0, 5) ?? []
}

async function fetchClients(): Promise<TradingClient[]> {
  const res = await fetch('/api/clients', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch clients')
  const body = (await res.json()) as { data: { data: TradingClient[] } }
  return body.data.data ?? []
}

async function fetchRevenueSummary(from?: string, to?: string) {
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  const res = await fetch(`/api/reports/revenue?${qs.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch revenue')
  const body = (await res.json()) as { data?: any } | any
  return body.data ?? body
}

async function fetchTrades(): Promise<any[]> {
  const res = await fetch('/api/reports/trades', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch trades')
  const body = (await res.json()) as { data?: any } | any
  return body.data ?? body
}

async function fetchThresholdStatus(): Promise<any> {
  const res = await fetch('/api/reports/threshold-status', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch threshold status')
  const body = (await res.json()) as { data: any }
  return body.data
}

// ── Custom Tooltip for light glassmorphism theme ───────────────────
function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--card-border)',
        borderRadius: 12,
        padding: '10px 14px',
        fontSize: 12,
        color: 'var(--text-primary)',
        boxShadow: 'var(--card-shadow)',
        background: 'var(--card-bg)',
      }}
    >
      <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ color: '#3b82f6', fontWeight: 800 }}>
        ${Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </div>
    </div>
  )
}

// ── Premium Sparkline ──────────────────────────────────────────────
function SparkLine({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data), min = Math.min(...data)
  const w = 90, h = 30
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', opacity: 0.8 }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BrokerDashboard() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [period, setPeriod] = useState<'7D' | '30D' | '90D'>('30D')
  const [showBalance, setShowBalance] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Core Queries
  const { data: wallet } = useQuery({ queryKey: ['wallet', 'summary'], queryFn: fetchWallet })
  const { data: positions } = useQuery({
    queryKey: ['positions', 'open'],
    queryFn: fetchPositions,
    refetchInterval: 5000,
  })
  const { data: orders } = useQuery({ queryKey: ['orders', 'recent-dash'], queryFn: fetchRecentOrders })
  const { data: clients } = useQuery({ queryKey: ['clients', 'count'], queryFn: fetchClients })
  const { data: revenueSummary } = useQuery({
    queryKey: ['reports', 'revenue', period],
    queryFn: () => {
      const now = new Date()
      const from =
        period === '7D'
          ? new Date(+now - 7 * 24 * 3600 * 1000)
          : period === '30D'
            ? new Date(+now - 30 * 24 * 3600 * 1000)
            : new Date(+now - 90 * 24 * 3600 * 1000)
      return fetchRevenueSummary(from.toISOString())
    },
  })
  const { data: trades } = useQuery({ queryKey: ['reports', 'trades'], queryFn: fetchTrades })
  const { data: thresholdStatus } = useQuery({
    queryKey: ['reports', 'threshold-status'],
    queryFn: fetchThresholdStatus,
    refetchInterval: 10000,
  })

  const openPos = positions?.length ?? 0
  const floatPnl = positions?.reduce((a, p) => a + Number(p.floatingPnl), 0) ?? 0
  const totalCredit = wallet ? parseFloat(wallet.totalCreditUSD) : 0
  const usedCredit = wallet ? parseFloat(wallet.usedCreditUSD) : 0
  const availableCredit = wallet ? parseFloat(wallet.availableCreditUSD) : 0

  const usdt = wallet ? parseFloat(wallet.balances?.USDT ?? '0') : 0
  const usdc = wallet ? parseFloat(wallet.balances?.USDC ?? '0') : 0
  const btc = wallet ? parseFloat(wallet.balances?.BTC ?? '0') : 0
  const eth = wallet ? parseFloat(wallet.balances?.ETH ?? '0') : 0
  const totalMergedBalance = usdt

  const creditPct = totalMergedBalance > 0 ? (usedCredit / totalMergedBalance) * 100 : 0

  const totalRevenue = revenueSummary?.summary?.totalCombinedRevenue
    ? Number(revenueSummary.summary.totalCombinedRevenue)
    : 128940 + (mounted ? Math.round(floatPnl) : 0)

  // Compute revenue trend buckets from trades
  const computeTrend = () => {
    if (!trades || trades.length === 0) return []
    const now = new Date()
    const days = period === '7D' ? 7 : period === '30D' ? 30 : 90
    const start = new Date(+now - days * 24 * 3600 * 1000)
    const buckets: Record<string, number> = {}
    for (let i = 0; i <= days; i++) {
      const dt = new Date(start.getTime() + i * 24 * 3600 * 1000)
      const key = dt.toISOString().slice(0, 10)
      buckets[key] = 0
    }
    trades.forEach((t) => {
      if (!t || !t.createdAt) return
      const dateObj = new Date(t.createdAt)
      if (isNaN(dateObj.getTime())) return
      const d = dateObj.toISOString().slice(0, 10)
      if (buckets[d] !== undefined) buckets[d] += Number(t.brokerRevenue ?? t.lpRevenue ?? 0)
    })
    return Object.entries(buckets).map(([k, v]) => ({ name: k, v }))
  }

  const revenueTrend = computeTrend()

  // Aggregate trade volume (lots) per symbol from trades
  const getTopAssets = () => {
    if (!trades || trades.length === 0) return []
    const volumeMap: Record<string, number> = {}
    trades.forEach((t) => {
      if (!t || !t.symbol || !t.symbol.name) return
      const name = t.symbol.displayName || t.symbol.name
      const vol = Number(t.filledVolume || 0)
      volumeMap[name] = (volumeMap[name] || 0) + vol
    })

    return Object.entries(volumeMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
  }

  const topAssets = getTopAssets()

  // Credit utilization data for PieChart
  const balanceRemaining = Math.max(0, totalMergedBalance - usedCredit)
  const CREDIT_DATA = [
    { name: 'Used Margin', value: usedCredit, color: '#3b82f6' }, // Indigo-Blue matching the send button
    { name: 'Equity', value: balanceRemaining, color: '#10b981' }, // Emerald green
  ]

  // Live activity feed from recent orders
  const liveFeed = (orders ?? []).slice(0, 5).map((o) => {
    const ord = o as any
    const initials =
      (ord.client?.firstName ?? 'C').slice(0, 1) + (ord.client?.lastName ?? 'T').slice(0, 1)
    return {
      id: ord.id,
      initials: initials.toUpperCase(),
      text: `${ord.client?.firstName ?? 'Client'} ${ord.side} ${Number(
        ord.filledVolume ?? ord.requestedVolume ?? 0
      ).toFixed(2)} ${ord.symbol?.name ?? ord.symbolName ?? ''}`,
      time: mounted
        ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—',
      color: ord.side === 'BUY' ? '#10b981' : '#3b82f6',
    }
  })


  return (
    <div className={s.dashboardWrapper}>
      {/* Background Soft Blobs */}
      <div className={s.blurBlob1} />
      <div className={s.blurBlob2} />

      {/* Page Header */}
      <div className={s.cardHeader} style={{ marginBottom: 28, position: 'relative', zIndex: 5, justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Period selector */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: 'var(--item-hover)',
              border: '1px solid var(--card-border)',
              borderRadius: 14,
              padding: 4,
            }}
          >
            {(['7D', '30D', '90D'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  height: 28,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: period === p ? 'var(--btn-active-bg)' : 'transparent',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: period === p ? 'var(--btn-active-color)' : 'var(--text-muted)',
                  boxShadow: period === p ? 'var(--card-shadow)' : 'none',
                  transition: 'all 200ms',
                }}
              >
                {p}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Main Grid Layout */}
      <div className={s.dashboardGrid}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Wallet Balance Card */}
          <div className={s.glassCard}>
            <div className={s.balanceHeader}>
              <div className={s.balanceLabelWrap}>
                <div className={s.walletIconCircle}>
                  <Wallet size={16} />
                </div>
                <span>Available Balance (USD)</span>
              </div>
            </div>

            <div className={s.balanceValueRow}>
              <span className={s.balanceValue}>
                {showBalance
                  ? `$${availableCredit.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : '$ •••••••'}
              </span>
              <button
                className={s.eyeToggleBtn}
                onClick={() => setShowBalance(!showBalance)}
                aria-label={showBalance ? 'Hide balance' : 'Show balance'}
              >
                {showBalance ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            <div className={s.limitBadge}>
              <AlertCircle size={12} />
              <span>Total Balance: ${totalMergedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • ${usedCredit.toLocaleString()} Used</span>
              <ChevronRight size={12} />
            </div>

            <div className={s.quickActionsSection}>
              <div className={s.sectionLabel}>Quick Actions</div>
              <div className={s.actionsGrid}>
                <div className={s.actionItem} onClick={() => router.push('/broker/wallet?action=deposit')}>
                  <button className={s.actionBtn} aria-label="Add Funds">
                    <Plus size={18} />
                  </button>
                  <span className={s.actionLabel}>Add Funds</span>
                </div>
                <div className={s.actionItem} onClick={() => router.push('/broker/wallet?action=withdraw')}>
                  <button className={s.actionBtn} aria-label="Withdraw">
                    <ArrowUpRight size={18} />
                  </button>
                  <span className={s.actionLabel}>Withdraw</span>
                </div>
                <div className={s.actionItem} onClick={() => router.push('/broker/wallet')}>
                  <button className={s.actionBtn} aria-label="Transactions">
                    <History size={18} />
                  </button>
                  <span className={s.actionLabel}>Transactions</span>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly Commission Tracker Widget */}
          {thresholdStatus && thresholdStatus.threshold > 0 && (
            <div className={s.glassCard}>
              <div className={s.cardHeader} style={{ paddingBottom: 10 }}>
                <span className={s.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🎁</span> Monthly Commission Tier
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(99, 102, 241, 0.08)', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                  {thresholdStatus.billingMonth}
                </span>
              </div>
              <div style={{ padding: '0 0 16px 0' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  First <strong>{thresholdStatus.threshold}</strong> standard lots each month are commission-free.
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {thresholdStatus.totalLotsThisMonth.toFixed(2)} / {thresholdStatus.threshold} Lots
                    </span>
                    <span style={{
                      color: thresholdStatus.percentUsed < 80 ? '#10b981' : thresholdStatus.percentUsed < 100 ? '#f59e0b' : '#ef4444'
                    }}>
                      {thresholdStatus.percentUsed.toFixed(0)}% Used
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{
                      width: `${thresholdStatus.percentUsed}%`,
                      height: '100%',
                      background: thresholdStatus.percentUsed < 80 
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : thresholdStatus.percentUsed < 100 
                          ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                          : 'linear-gradient(90deg, #ef4444, #f87171)',
                      borderRadius: 10,
                      transition: 'width 0.4s ease-out',
                    }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Free Lots Used</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981', marginTop: 2 }}>{thresholdStatus.freeLotsUsed.toFixed(2)} lots</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Remaining Free</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: thresholdStatus.freeLotsRemaining > 0 ? '#3b82f6' : 'var(--text-muted)', marginTop: 2 }}>{thresholdStatus.freeLotsRemaining.toFixed(2)} lots</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Chargeable lots this month:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{thresholdStatus.chargeableLots.toFixed(2)} lots</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>LP commission charged:</span>
                    <span style={{ fontWeight: 700, color: '#ef4444' }}>${thresholdStatus.commissionThisMonth.toFixed(2)}</span>
                  </div>
                </div>

                {thresholdStatus.freeLotsRemaining > 0 && (
                  <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)', fontSize: 10, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12 }}>⚡</span>
                    <span>No LP commission will be charged on your next {thresholdStatus.freeLotsRemaining.toFixed(2)} lots.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Orders table inside a Glass Card */}
          <div className={s.glassCard}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>Recent Orders</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6', fontFamily: 'var(--cp-mono)' }}>
                {orders?.length ?? 0} Orders
              </span>
            </div>

            <div className={s.transactionsList}>
              {orders && orders.length > 0 ? (
                orders.map((o) => {
                  const ord = o as any
                  return (
                    <div className={s.transactionItem} key={ord.id}>
                      <div className={s.txLeft}>
                        <div className={s.avatarPlaceholder} style={{ width: 34, height: 34, fontSize: 10, background: ord.side === 'BUY' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)', color: ord.side === 'BUY' ? '#10b981' : '#3b82f6' }}>
                          {ord.symbol?.name?.slice(0, 2) ?? 'FX'}
                        </div>
                        <div className={s.txDetails}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={s.txName} style={{ fontFamily: 'var(--cp-mono)', fontSize: 12 }}>{ord.symbol?.name ?? '—'}</span>
                          </div>
                          <span className={s.txTime} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                            {ord.side} • {Number(ord.requestedVolume).toFixed(2)} Lots
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className={s.txAmount} style={{ color: ord.status === 'FILLED' ? '#10b981' : ord.status === 'REJECTED' ? '#ef4444' : '#f59e0b', fontSize: 12 }}>
                          {ord.status}
                        </span>
                        <div className={s.txTime} style={{ marginTop: 2 }}>
                          {mounted ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No recent orders found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Column 2: Statistics, Charts, & Indicators ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Stat Cards Row */}
          <div className={s.metricsRow}>
            {/* Total Credit */}
            <div className={s.metricCard}>
              <div className={s.metricLabel}>Total Credit</div>
              <div className={s.metricValueRow} style={{ marginTop: 8 }}>
                <span className={s.metricValue}>
                  ${totalCredit.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </span>
                <SparkLine data={[42, 55, 61, 48, 72, 80, totalCredit / 1000]} color="#3b82f6" />
              </div>
            </div>

            {/* Open Positions */}
            <div className={s.metricCard}>
              <div className={s.metricLabel}>Open Positions</div>
              <div className={s.metricValueRow} style={{ marginTop: 8 }}>
                <span className={s.metricValue}>{openPos}</span>
                <SparkLine data={[2, 5, 3, 8, 6, 4, openPos]} color="#d946ef" />
              </div>
            </div>
          </div>

          <div className={s.metricsRow} style={{ marginTop: -10 }}>
            {/* Total Clients */}
            <div className={s.metricCard}>
              <div className={s.metricLabel}>Total Clients</div>
              <div className={s.metricValueRow} style={{ marginTop: 8 }}>
                <span className={s.metricValue}>{clients?.length ?? 0}</span>
                <SparkLine data={[0, 1, 1, 2, 3, clients?.length ?? 0]} color="#10b981" />
              </div>
            </div>

            {/* Floating PnL */}
            <div className={s.metricCard}>
              <div className={s.metricLabel}>Floating PnL</div>
              <div className={s.metricValueRow} style={{ marginTop: 8 }}>
                <span className={s.metricValue} style={{ color: floatPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {floatPnl >= 0 ? '+' : ''}${Math.round(floatPnl).toLocaleString()}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--cp-mono)' }}>
                  Live P&L
                </span>
              </div>
            </div>
          </div>

          {/* Revenue Trend Area Chart */}
          <div className={s.glassCard}>
            <div className={s.cardHeader} style={{ marginBottom: 12 }}>
              <span className={s.cardTitle}>Revenue Trend</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ paddingTop: 0 }}>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={revenueTrend} margin={{ top: 10, right: 0, bottom: 0, left: -25 }}>
                  <defs>
                    <linearGradient id="premiumRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line-color)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--cp-mono)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--cp-mono)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#premiumRevGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Asset Performance Breakdown List to balance height */}
            <div style={{ marginTop: 22, borderTop: '1px solid var(--line-color)', paddingTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 12, fontFamily: 'var(--cp-mono)' }}>
                Top Assets
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topAssets.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                    No traded assets found
                  </div>
                ) : (
                  topAssets.map((asset) => (
                    <div key={asset.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{asset.name}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-accent)', fontFamily: 'var(--cp-mono)' }}>
                        {asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Lots
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Column 3: Utilisation, MRR Target, & Live Activity ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Credit Utilisation Donut */}
          <div className={s.glassCard}>
            <div className={s.cardHeader} style={{ marginBottom: 12 }}>
              <span className={s.cardTitle}>Margin Utilisation</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6', fontFamily: 'var(--cp-mono)' }}>
                {creditPct.toFixed(1)}%
              </span>
            </div>

            <div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={CREDIT_DATA}
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={52}
                      dataKey="value"
                      paddingAngle={3}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {CREDIT_DATA.map((d, i) => (
                        <Cell key={i} fill={d.color} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: any, name: any) => [`$${Number(v).toLocaleString()}`, name]}
                      contentStyle={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--card-border)',
                        borderRadius: 10,
                        fontSize: 11,
                        fontFamily: 'var(--cp-mono)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {CREDIT_DATA.map((d) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{d.name}</span>
                    </div>
                    <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--cp-mono)', fontWeight: 600 }}>
                      ${d.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className={s.glassCard}>
            <div className={s.cardHeader} style={{ marginBottom: 14 }}>
              <span className={s.cardTitle}>Live Activity</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', fontFamily: 'var(--cp-mono)' }}>Live</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {liveFeed.length > 0 ? (
                liveFeed.map((f) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: `${f.color}12`,
                        border: `1.5px solid ${f.color}25`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 800,
                        color: f.color,
                        flexShrink: 0,
                        fontFamily: 'var(--cp-mono)',
                      }}
                    >
                      {f.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.3, marginBottom: 2 }}>
                        {f.text}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--cp-mono)' }}>
                        {f.time}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Waiting for active trades...
                </div>
              )}
            </div>
          </div>


        </div>
      </div>
    </div>
  )
}
