'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { StatCard } from '@/components/data/StatCard/StatCard'
import { Button } from '@/components/ui/Button'
import { SlidePanel } from '@/components/layout/SlidePanel/SlidePanel'
import { DataTable } from '@/components/data/DataTable/DataTable'
import type { Broker } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchBrokers(): Promise<Broker[]> {
  const res = await fetch('/api/brokers?limit=100', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch brokers')
  const body = await res.json() as { data: { data: Broker[] } }
  return body.data.data
}

export default function AdminCreditPage() {
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: brokers, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'brokers', 'list-credit'],
    queryFn: fetchBrokers,
  })

  // Filter brokers that have wallets (typically APPROVED brokers)
  const brokersWithWallets = brokers?.filter((b) => b.wallet) ?? []

  // Dynamic stats calculation
  const totalPlatformCredit = brokersWithWallets.reduce(
    (sum, b) => sum + Number(b.wallet?.totalCreditUSD ?? 0),
    0
  )
  const totalUtilizedCredit = brokersWithWallets.reduce(
    (sum, b) => sum + Number(b.wallet?.usedCreditUSD ?? 0),
    0
  )
  const availableCreditBuffer = brokersWithWallets.reduce(
    (sum, b) => sum + Number(b.wallet?.availableCreditUSD ?? 0),
    0
  )

  const formatUSD = (val: number) => {
    return `$${val.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const handleClosePanel = () => {
    setPanelOpen(false)
    setSelectedBrokerId('')
    setAmount('')
    setReason('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBrokerId) {
      alert('Please select a broker')
      return
    }
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Amount must be a positive number')
      return
    }
    if (reason.trim().length < 3 || reason.trim().length > 500) {
      alert('Reason must be between 3 and 500 characters')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/wallet/credit/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokerId: selectedBrokerId,
          amount: amount,
          reason: reason.trim(),
        }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(err.message || 'Credit allocation failed')
      }

      alert('Credit allocated successfully!')
      handleClosePanel()
      refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
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
          <span className={`${s.breadcrumbItem} ${s.breadcrumbItemActive}`}>Credit Management</span>
        </div>
        <Button variant="primary" size="md" onClick={() => setPanelOpen(true)}>
          + Allocate Credit
        </Button>
      </div>

      <div className={s.statGrid}>
        <StatCard label="Total Platform Credit" value={formatUSD(totalPlatformCredit)} accent="accent" loading={isLoading} />
        <StatCard label="Total Utilized Credit" value={formatUSD(totalUtilizedCredit)} loading={isLoading} />
        <StatCard label="Available Credit Buffer" value={formatUSD(availableCreditBuffer)} accent="success" loading={isLoading} />
      </div>

      <div className={s.tableCard}>
        <DataTable<Broker>
          columns={[
            {
              key: 'companyName',
              header: 'Broker Company',
              render: (v) => <span className={s.companyName}>{String(v)}</span>,
            },
            {
              key: 'wallet',
              header: 'Total Credit',
              mono: true,
              align: 'right',
              render: (v) => (v ? formatUSD(Number((v as any).totalCreditUSD)) : '—'),
            },
            {
              key: 'wallet',
              header: 'Utilized Credit',
              mono: true,
              align: 'right',
              render: (v) => (v ? formatUSD(Number((v as any).usedCreditUSD)) : '—'),
            },
            {
              key: 'wallet',
              header: 'Available Credit',
              mono: true,
              align: 'right',
              render: (v) => (v ? formatUSD(Number((v as any).availableCreditUSD)) : '—'),
            },
            {
              key: 'id',
              header: 'Action',
              width: '150px',
              align: 'center',
              render: (v, row) => (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedBrokerId(String(v))
                    setPanelOpen(true)
                  }}
                  disabled={row.status !== 'APPROVED'}
                >
                  Allocate Credit
                </Button>
              ),
            },
          ]}
          data={brokersWithWallets}
          loading={isLoading}
        />
      </div>

      <SlidePanel
        open={panelOpen}
        onClose={handleClosePanel}
        title="Allocate Trading Credit"
        subtitle="Grant additional margin credit to an approved broker"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
            <label style={labelStyle}>Amount (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="e.g. 50000.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Audit / Allocation Reason</label>
            <textarea
              required
              minLength={3}
              maxLength={500}
              placeholder="Provide a detailed audit reason for this credit adjustment..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
              {isSubmitting ? 'Allocating…' : 'Allocate Credit'}
            </Button>
          </div>
        </form>
      </SlidePanel>
    </div>
  )
}
