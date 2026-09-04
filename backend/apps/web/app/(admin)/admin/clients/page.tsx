'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SlidePanel } from '@/components/layout/SlidePanel/SlidePanel'
import type { AdminClientDetail, AdminClientSummary } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

type ClientsResponse = {
  data: AdminClientSummary[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

async function fetchClients(): Promise<ClientsResponse> {
  const res = await fetch('/api/admin/clients', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch admin clients')
  const body = await res.json() as { data: ClientsResponse }
  return body.data
}

async function fetchClientDetail(clientId: string): Promise<AdminClientDetail> {
  const res = await fetch(`/api/admin/clients/${clientId}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch client detail')
  const body = await res.json() as { data: AdminClientDetail }
  return body.data
}

function DateCell({ dateString }: { dateString: string }) {
  const [formatted, setFormatted] = useState('')
  useEffect(() => {
    const d = new Date(dateString)
    setFormatted(isNaN(d.getTime()) ? '—' : d.toLocaleDateString())
  }, [dateString])
  return <span>{formatted || '—'}</span>
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPROVED: s.chipGreen ?? '',
    PENDING:  s.chipAmber ?? '',
    SUSPENDED: s.chipRed ?? '',
    standard: s.chipNeutral ?? '',
    ecn: s.chipTeal ?? '',
    raw_spread: s.chipTeal ?? '',
  }
  return <span className={`${s.chip} ${map[status] ?? s.chipNeutral ?? ''}`}>• {status}</span>
}

export default function AdminClientsPage() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'clients', 'list'],
    queryFn: fetchClients,
  })

  const { data: selectedClient, isLoading: detailLoading } = useQuery({
    queryKey: ['admin', 'clients', 'detail', selectedClientId],
    queryFn: () => fetchClientDetail(selectedClientId as string),
    enabled: !!selectedClientId,
  })

  const clients = data?.data ?? []

  const brokerCounts = useMemo(() => {
    const brokerIds = new Set(clients.map((c) => c.brokerId))
    return brokerIds.size
  }, [clients])

  const activeClients = clients.filter((c) => c.isActive).length
  const totalOpenPositions = clients.reduce((sum, c) => sum + c.openPositionsCount, 0)

  const filtered = clients.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.externalClientId?.toLowerCase().includes(q) ||
      c.firstName?.toLowerCase().includes(q) ||
      c.lastName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.brokerCompanyName?.toLowerCase().includes(q)
    )
  })

  return (
    <div>

      {/* ─── Stat Cards ──────────────────────────────────────── */}
      <div className={s.statGrid} style={{ marginBottom: 20 }}>
        <div className={`${s.statCard} ${s.statCardAccentTeal}`}>
          <div className={s.statLabel}>Total Clients</div>
          <div className={s.statValue}>{isLoading ? '—' : clients.length}</div>
          <div className={`${s.statDelta} ${s.statDeltaUp}`}>Registered accounts</div>
        </div>
        <div className={`${s.statCard} ${s.statCardAccentGreen}`}>
          <div className={s.statLabel}>Active Clients</div>
          <div className={s.statValue} style={{ color: '#22c55e' }}>{isLoading ? '—' : activeClients}</div>
          <div className={`${s.statDelta} ${s.statDeltaUp}`}>↑ Active accounts</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>Open Positions</div>
          <div className={s.statValue}>{isLoading ? '—' : totalOpenPositions}</div>
          <div className={s.statDelta}>Live exposure</div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>Brokers Represented</div>
          <div className={s.statValue}>{isLoading ? '—' : brokerCounts}</div>
          <div className={s.statDelta}>Unique brokers</div>
        </div>
      </div>

      {/* ─── Search & Table ───────────────────────────────────── */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>All Client Accounts</span>
          <input
            className={s.input}
            style={{ width: 240, height: 34 }}
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Client ID</th>
                <th>First Name</th>
                <th>Last Name</th>
                <th>Broker</th>
                <th>Broker Status</th>
                <th>Account Type</th>
                <th>Leverage</th>
                <th>CCY</th>
                <th>Open</th>
                <th>Float PnL</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                    <div className={s.spinner} style={{ margin: '0 auto 8px' }} />
                    Loading clients…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                    No clients found
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedClientId(c.id)}
                  style={{ cursor: 'pointer' }}
                  className={selectedClientId === c.id ? s.rowActive : ''}
                >
                  <td className={s.tableMono}>{c.externalClientId === 'ALGO_HOUSE' ? c.id.substring(0, 12) : c.externalClientId}</td>
                  <td>{c.firstName}</td>
                  <td>{c.lastName}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{c.brokerCompanyName}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.brokerEmail}</div>
                  </td>
                  <td><StatusChip status={c.brokerStatus} /></td>
                  <td><StatusChip status={c.accountType} /></td>
                  <td className={s.tableMono}>1:{c.leverage}</td>
                  <td className={s.tableMono}>{c.currency}</td>
                  <td className={s.tableMono}>{c.openPositionsCount}</td>
                  <td className={s.tableMono} style={{ color: Number(c.floatingPnl) >= 0 ? '#22c55e' : '#ef4444' }}>
                    {c.floatingPnl}
                  </td>
                  <td className={s.tableMono}><DateCell dateString={c.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Client Detail Slide Panel ────────────────────────── */}
      <SlidePanel
        open={!!selectedClient}
        onClose={() => setSelectedClientId(null)}
        title={selectedClient?.externalClientId ?? 'Client Detail'}
        subtitle={selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName} · ${selectedClient.broker.companyName}` : ''}
      >
        {detailLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40, gap: 12 }}>
            <div className={s.spinner} />
            <span style={{ color: '#64748b', fontSize: 13 }}>Loading client detail…</span>
          </div>
        )}
        {!detailLoading && selectedClient && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Broker Info */}
            <div className={s.card}>
              <div className={s.cardBody}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div className={s.fieldLabel}>Broker</div>
                    <div style={{ color: '#f1f5f9', fontWeight: 600, marginTop: 4 }}>{selectedClient.broker.companyName}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>{selectedClient.broker.email}</div>
                  </div>
                  <div>
                    <div className={s.fieldLabel}>Broker Status</div>
                    <div style={{ marginTop: 4 }}><StatusChip status={selectedClient.broker.status} /></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { label: 'Open Positions', value: selectedClient.openPositionsCount },
                { label: 'Floating PnL', value: selectedClient.floatingPnl },
                { label: 'Closed PnL Today', value: selectedClient.closedPnlToday },
                { label: 'Leverage', value: `1:${selectedClient.leverage}` },
              ].map(({ label, value }) => (
                <div key={label} className={s.card} style={{ padding: '14px 16px' }}>
                  <div className={s.fieldLabel}>{label}</div>
                  <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 18, fontFamily: 'JetBrains Mono, monospace', marginTop: 4 }}>{String(value)}</div>
                </div>
              ))}
            </div>

            {/* Recent Positions */}
            <div>
              <div className={s.fieldLabel} style={{ marginBottom: 8 }}>Recent Positions</div>
              {selectedClient.positions.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 13 }}>No positions found.</div>
              ) : selectedClient.positions.slice(0, 5).map((position) => (
                <div key={position.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#f1f5f9' }}>{(position as any).symbolName ?? (position as any).symbol?.name ?? '—'}</strong>
                    <StatusChip status={position.status} />
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                    Vol {position.volume} · Open {position.openPrice} · Current {position.currentPrice}
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Orders */}
            <div>
              <div className={s.fieldLabel} style={{ marginBottom: 8 }}>Recent Orders</div>
              {selectedClient.orders.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 13 }}>No orders found.</div>
              ) : selectedClient.orders.slice(0, 5).map((order) => (
                <div key={order.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#f1f5f9' }}>{(order as any).symbolName ?? (order as any).symbol?.name ?? '—'}</strong>
                    <StatusChip status={order.status} />
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                    {order.side} {order.type} · Vol {order.requestedVolume} · Exec {order.executionPrice ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  )
}