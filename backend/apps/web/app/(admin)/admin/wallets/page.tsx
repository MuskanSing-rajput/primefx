'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { StatCard } from '@/components/data/StatCard/StatCard'
import { DataTable } from '@/components/data/DataTable/DataTable'
import { Button } from '@/components/ui/Button'
import { SlidePanel } from '@/components/layout/SlidePanel/SlidePanel'
import type { Broker } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchAdminMetrics() {
  const res = await fetch('/api/admin/dashboard', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch admin metrics')
  const body = await res.json() as any
  return body.data ?? body
}

async function fetchAdminTransactions() {
  const res = await fetch('/api/admin/transactions?limit=100', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch admin transactions')
  const body = await res.json() as any
  return body.data ?? body
}

async function fetchBrokers(): Promise<Broker[]> {
  const res = await fetch('/api/brokers?limit=100', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch brokers')
  const body = await res.json() as { data: { data: Broker[] } }
  return body.data.data
}

async function fetchAdminSettings(): Promise<any[]> {
  const res = await fetch('/api/admin/settings', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch settings')
  const body = await res.json() as any
  return Array.isArray(body) ? body : (body?.data ?? [])
}

export default function AdminWalletsPage() {
  const queryClient = useQueryClient()
  const [processingId, setProcessingId] = useState<string | null>(null)
  
  // SlidePanel Adjustment form state
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedBrokerId, setSelectedBrokerId] = useState('')
  const [adjustType, setAdjustType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT')
  const [adjustCurrency, setAdjustCurrency] = useState('USDT')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['admin','dashboard','metrics'],
    queryFn: fetchAdminMetrics
  })

  const { data: txData, isLoading: txLoading, refetch: refetchTxs } = useQuery({
    queryKey: ['admin','wallet','transactions'],
    queryFn: fetchAdminTransactions
  })

  const { data: brokers } = useQuery({
    queryKey: ['admin', 'brokers', 'list-wallets-adjust'],
    queryFn: fetchBrokers,
  })

  const { data: settings } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: fetchAdminSettings,
  })

  const transactions = txData?.data ?? []

  const isAssetActive = (symbol: string): boolean => {
    if (!settings) return true
    const key = `crypto_active_${symbol}`
    const found = settings.find((s: any) => s.key === key)
    return found ? found.value === 'true' : true
  }

  useEffect(() => {
    if (settings) {
      const currencies = ['USDT', 'USDC', 'BTC', 'ETH']
      const active = currencies.find(c => {
        const key = `crypto_active_${c}`
        const found = settings.find((s: any) => s.key === key)
        return found ? found.value === 'true' : true
      })
      if (active && !isAssetActive(adjustCurrency)) {
        setAdjustCurrency(active)
      }
    }
  }, [settings])

  const approveMutation = useMutation({
    mutationFn: async ({ txId, approve }: { txId: string; approve: boolean }) => {
      const res = await fetch(`/api/wallet/transactions/${txId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message ?? 'Failed to process transaction')
      }
      return res.json()
    },
    onSuccess: () => {
      refetchMetrics()
      refetchTxs()
      alert('Transaction updated successfully')
    },
    onError: (err: any) => {
      alert(err.message ?? 'An error occurred')
    },
    onSettled: () => {
      setProcessingId(null)
    }
  })

  const handleAction = (txId: string, approve: boolean) => {
    if (!confirm(`Are you sure you want to ${approve ? 'approve' : 'reject'} this transaction?`)) return
    setProcessingId(txId)
    approveMutation.mutate({ txId, approve })
  }

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBrokerId) {
      alert('Please select a broker')
      return
    }
    const parsedAmount = parseFloat(adjustAmount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Amount must be a positive number')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/wallet/admin/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokerId: selectedBrokerId,
          type: adjustType,
          currency: adjustCurrency,
          amount: adjustAmount,
          note: adjustNote.trim(),
        }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(err.message || 'Adjustment failed')
      }

      alert('Wallet adjusted successfully!')
      setPanelOpen(false)
      setSelectedBrokerId('')
      setAdjustAmount('')
      setAdjustNote('')
      refetchMetrics()
      refetchTxs()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const txStatusStyle = (status: string) => {
    const map: Record<string, string | undefined> = {
      PENDING: s.chipAmber,
      APPROVED: s.chipGreen,
      CONFIRMED: s.chipGreen,
      REJECTED: s.chipRed,
      COMPLETED: s.chipTeal
    }
    return map[status] ?? s.chipNeutral ?? ''
  }

  const inputStyle: React.CSSProperties = {
    height: '38px',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 'var(--radius-2)',
    padding: '0 var(--space-3)',
    color: 'var(--text-primary)',
    width: '100%',
  }

  const textareaStyle: React.CSSProperties = {
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 'var(--radius-2)',
    padding: 'var(--space-2) var(--space-3)',
    color: 'var(--text-primary)',
    width: '100%',
    minHeight: '80px',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <div className={s.breadcrumb}>
          <span className={s.breadcrumbItem}>PrimeFX</span>
          <span className={s.breadcrumbSep}>›</span>
          <span className={s.breadcrumbItem}>Admin</span>
          <span className={s.breadcrumbSep}>›</span>
          <span className={`${s.breadcrumbItem} ${s.breadcrumbItemActive}`}>Wallet Approvals</span>
        </div>
        <Button variant="primary" size="md" onClick={() => setPanelOpen(true)}>
          + Manual Adjustment
        </Button>
      </div>

      <div className={s.statGrid}>
        <StatCard label="Pending Deposits" value={metrics?.pendingDeposits ?? '0'} />
        <StatCard label="Pending Withdrawals" value={metrics?.pendingWithdrawals ?? '0'} />
        <StatCard label="Approved (24h)" value={metrics?.approvedTransactions24h ? `$${Number(metrics.approvedTransactions24h).toLocaleString()}` : '$250,000.00'} accent="success" />
      </div>

      <div className={s.tableCard}>
        <DataTable<any>
          columns={[
            {
              key: 'wallet',
              header: 'Broker',
              render: (v) => <span style={{ fontWeight: 600 }}>{(v as any)?.broker?.companyName ?? 'System'}</span>,
            },
            {
              key: 'type',
              header: 'Type',
              render: (v) => (
                <span style={{ fontWeight: 700, color: v === 'DEPOSIT' ? '#10b981' : '#ef4444' }}>
                  {String(v)}
                </span>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              mono: true,
              align: 'right',
              render: (v) => Number(v).toFixed(2),
            },
            { key: 'currency', header: 'Currency' },
            {
              key: 'txHash',
              header: 'Tx Hash / Address',
              render: (v, row) => {
                // For withdrawals, address is stored in adminNote as "DESTINATION_ADDRESS:..."
                if (row.type === 'WITHDRAWAL' && row.adminNote && String(row.adminNote).startsWith('DESTINATION_ADDRESS:')) {
                  const addr = String(row.adminNote).replace('DESTINATION_ADDRESS:', '')
                  return <code style={{ fontSize: 10, color: 'var(--text-accent)', wordBreak: 'break-all' }} title={addr}>{addr.substring(0, 20)}...</code>
                }
                return v ? <code style={{ fontSize: 10 }}>{String(v).substring(0, 16)}...</code> : '—'
              },
            },
            {
              key: 'status',
              header: 'Status',
              render: (v) => <span className={`${s.chip} ${txStatusStyle(String(v))}`}>{String(v)}</span>,
            },
            {
              key: 'id',
              header: 'Actions',
              align: 'center',
              render: (v, row) => {
                if (row.status !== 'PENDING') {
                  return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Processed</span>
                }
                const isBusy = processingId === String(v)
                return (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleAction(String(v), true)}
                      disabled={isBusy}
                      style={{ background: '#10b981', borderColor: '#10b981', padding: '3px 8px', fontSize: 10 }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAction(String(v), false)}
                      disabled={isBusy}
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: '#ef4444', padding: '3px 8px', fontSize: 10 }}
                    >
                      Reject
                    </Button>
                  </div>
                )
              },
            },
          ]}
          data={transactions}
          loading={txLoading}
          empty={<div className={s.emptyFeed}>No pending wallet transactions requiring approval</div>}
        />
      </div>

      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="Manual Wallet Adjustment"
        subtitle="Perform a manual deposit or withdrawal adjustment on a broker's wallet"
      >
        <form onSubmit={handleAdjustSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Select Broker</label>
            <select
              value={selectedBrokerId}
              onChange={(e) => setSelectedBrokerId(e.target.value)}
              style={inputStyle}
              required
            >
              <option value="">-- Choose Broker --</option>
              {brokers
                ?.filter((b) => b.status === 'APPROVED')
                .map((broker) => (
                  <option key={broker.id} value={broker.id}>
                    {broker.companyName} ({broker.email})
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Adjustment Type</label>
            <select
              value={adjustType}
              onChange={(e) => setAdjustType(e.target.value as any)}
              style={inputStyle}
              required
            >
              <option value="DEPOSIT">DEPOSIT (Add Funds)</option>
              <option value="WITHDRAWAL">WITHDRAWAL (Deduct Funds)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Currency</label>
            <select
              value={adjustCurrency}
              onChange={(e) => setAdjustCurrency(e.target.value)}
              style={inputStyle}
              required
            >
              {isAssetActive('USDT') && <option value="USDT">Tether (USDT)</option>}
              {isAssetActive('USDC') && <option value="USDC">USD Coin (USDC)</option>}
              {isAssetActive('BTC') && <option value="BTC">Bitcoin (BTC)</option>}
              {isAssetActive('ETH') && <option value="ETH">Ethereum (ETH)</option>}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Amount</label>
            <input
              type="number"
              step="0.00000001"
              min="0.00000001"
              required
              placeholder="e.g. 500.00"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Admin Note</label>
            <textarea
              placeholder="Provide a detailed audit note for this manual adjustment..."
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              style={textareaStyle}
            />
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={isSubmitting}
              style={{ width: '100%' }}
            >
              {isSubmitting ? 'Processing…' : 'Submit Adjustment'}
            </Button>
          </div>
        </form>
      </SlidePanel>
    </div>
  )
}
