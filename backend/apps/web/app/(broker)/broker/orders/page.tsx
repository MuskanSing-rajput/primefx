'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Order } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchOrders(): Promise<{ data: Order[] }> {
  const res = await fetch('/api/orders', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as { data: { data: Order[] } }
  return body.data
}

function DateTimeCell({ d }: { d: string }) {
  const [fmt, setFmt] = useState('')
  useEffect(() => { setFmt(new Date(d).toLocaleString()) }, [d])
  return <span>{fmt || '—'}</span>
}

type FilterTab = 'all' | 'FILLED' | 'REJECTED' | 'PENDING'

export default function BrokerOrdersPage() {
  const [filter, setFilter] = useState<FilterTab>('all')

  const { data, isLoading } = useQuery({ queryKey: ['orders','list'], queryFn: fetchOrders, refetchInterval: 10000 })
  const orders = data?.data ?? []

  const filtered = useMemo(() => {
    if (filter === 'all') return orders
    return orders.filter(o => o.status === filter)
  }, [orders, filter])

  const counts = {
    all:      orders.length,
    FILLED:   orders.filter(o => o.status === 'FILLED').length,
    REJECTED: orders.filter(o => o.status === 'REJECTED').length,
    PENDING:  orders.filter(o => o.status === 'PENDING').length,
  }

  const statusChip = (status: string): string => {
    const m: Record<string, string | undefined> = { FILLED: s.chipGreen, REJECTED: s.chipRed, PENDING: s.chipAmber, CANCELLED: s.chipNeutral }
    return m[status] ?? s.chipNeutral ?? ''
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: `All (${counts.all})` },
    { key: 'FILLED',   label: `Filled (${counts.FILLED})` },
    { key: 'REJECTED', label: `Rejected (${counts.REJECTED})` },
    { key: 'PENDING',  label: `Pending (${counts.PENDING})` },
  ]

  return (
    <>

      {/* Stat cards */}
      <div className={s.statGrid} style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <div className={`${s.statCard} ${s.statCardAccentTeal}`}>
          <div className={s.statLabel}>Total Orders</div>
          <div className={s.statValue}>{isLoading ? '—' : orders.length}</div>
        </div>
        <div className={`${s.statCard} ${s.statCardAccentGreen}`}>
          <div className={s.statLabel}>Filled</div>
          <div className={s.statValue} style={{ color: '#22c55e' }}>{isLoading ? '—' : counts.FILLED}</div>
        </div>
        <div className={`${s.statCard} ${s.statCardAccentRed}`}>
          <div className={s.statLabel}>Rejected</div>
          <div className={s.statValue} style={{ color: '#f87171' }}>{isLoading ? '—' : counts.REJECTED}</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>Pending</div>
          <div className={s.statValue} style={{ color: '#fbbf24' }}>{isLoading ? '—' : counts.PENDING}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{
              height: 32, padding: '0 16px', borderRadius: 8, border: '1px solid var(--card-border)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filter === t.key ? 'var(--btn-active-bg)' : 'var(--item-hover)',
              color: filter === t.key ? 'var(--btn-active-color)' : 'var(--text-muted)', transition: 'all 150ms',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>Executions</span>
          <span className={`${s.chip} ${s.chipNeutral}`}>{filtered.length} records</span>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>Symbol</th><th>Type</th><th>Side</th><th>Volume</th><th>Request Price</th><th>Fill Price</th><th>Status</th><th>Reason</th><th>Time</th></tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9}><div className={s.emptyState}><div className={s.spinner}/><div className={s.emptyText}>Loading orders…</div></div></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9}>
                  <div className={s.emptyState}>
                    <div className={s.emptyIcon}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div>
                    <div className={s.emptyText}>No orders found</div>
                  </div>
                </td></tr>
              ) : filtered.map(o => {
                const ord = o as any
                return (
                  <tr key={ord.id}>
                    <td className={s.tableMono} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ord.symbol?.name ?? '—'}</td>
                    <td><span className={`${s.chip} ${s.chipNeutral}`}>{ord.type}</span></td>
                    <td><span className={`${s.chip} ${ord.side === 'BUY' ? s.chipGreen : s.chipRed}`}><span className={s.chipDot}/>{ord.side}</span></td>
                    <td className={s.tableMono}>{Number(ord.requestedVolume).toFixed(2)}</td>
                    <td className={s.tableMono}>{ord.requestedPrice ? Number(ord.requestedPrice).toFixed(5) : 'MKT'}</td>
                    <td className={s.tableMono}>{ord.executionPrice ? Number(ord.executionPrice).toFixed(5) : '—'}</td>
                    <td><span className={`${s.chip} ${statusChip(ord.status)}`}>{ord.status}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ord.rejectionReason ?? '—'}</td>
                    <td className={s.tableMono}><DateTimeCell d={ord.createdAt}/></td>
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
