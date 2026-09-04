'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@/components/data/DataTable/DataTable'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge/Badge'
import { SlidePanel } from '@/components/layout/SlidePanel/SlidePanel'
import type { ExecutionAccount } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchExecutionAccounts(): Promise<ExecutionAccount[]> {
  const res = await fetch('/api/execution-accounts', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch execution accounts')
  const body = await res.json() as { data: ExecutionAccount[] }
  return body.data
}

export default function AdminExecutionPage() {
  const [panelOpen, setPanelOpen] = useState(false)

  // Form states
  const [accountName, setAccountName] = useState('')
  const [provider, setProvider] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [serverAddress, setServerAddress] = useState('')
  const [maxExposure, setMaxExposure] = useState('1000000.00')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: accounts, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'execution-accounts'],
    queryFn: fetchExecutionAccounts,
  })

  const handleClosePanel = () => {
    setPanelOpen(false)
    setAccountName('')
    setProvider('')
    setAccountNumber('')
    setServerAddress('')
    setMaxExposure('1000000.00')
    setLogin('')
    setPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (accountName.trim().length < 2 || accountName.trim().length > 100) {
      alert('Account Name must be between 2 and 100 characters')
      return
    }
    if (provider.trim().length < 2 || provider.trim().length > 100) {
      alert('Provider must be between 2 and 100 characters')
      return
    }
    if (accountNumber.trim().length < 1 || accountNumber.trim().length > 100) {
      alert('Account Number must be between 1 and 100 characters')
      return
    }
    if (serverAddress.trim().length < 1 || serverAddress.trim().length > 200) {
      alert('Server Address must be between 1 and 200 characters')
      return
    }
    
    const decimalRegex = /^\d+(\.\d+)?$/
    if (!decimalRegex.test(maxExposure)) {
      alert('Invalid Max Exposure value')
      return
    }
    if (!login.trim()) {
      alert('API/Login credential is required')
      return
    }
    if (!password.trim()) {
      alert('Password/Secret credential is required')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/execution-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: accountName.trim(),
          provider: provider.trim(),
          accountNumber: accountNumber.trim(),
          serverAddress: serverAddress.trim(),
          maxExposure: maxExposure,
          credentials: {
            login: login.trim(),
            password: password.trim(),
          },
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message || 'Failed to create execution account')
      }

      alert('Execution Account created successfully!')
      handleClosePanel()
      refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Styles
  const inputStyle: React.CSSProperties = {
    height: '38px',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 'var(--radius-2)',
    padding: '0 var(--space-3)',
    color: 'var(--text-primary)',
    width: '100%',
    fontSize: 'var(--text-sm)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  }

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-accent)',
    textTransform: 'uppercase',
    fontWeight: 700,
    letterSpacing: '0.08em',
    marginTop: 'var(--space-4)',
    borderBottom: '1px solid var(--input-border)',
    paddingBottom: '4px',
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <div className={s.breadcrumb}>
          <span className={s.breadcrumbItem}>PrimeFX</span>
          <span className={s.breadcrumbSep}>›</span>
          <span className={s.breadcrumbItem}>Admin</span>
          <span className={s.breadcrumbSep}>›</span>
          <span className={`${s.breadcrumbItem} ${s.breadcrumbItemActive}`}>Execution Accounts</span>
        </div>
        <Button variant="primary" size="md" onClick={() => setPanelOpen(true)}>
          + Add Execution Account
        </Button>
      </div>

      <div className={s.tableCard}>
        <DataTable<ExecutionAccount>
          columns={[
            { key: 'accountName', header: 'Account Name', render: (v) => <span className={s.companyName}>{String(v)}</span> },
            { key: 'provider', header: 'Provider / LP' },
            { key: 'assignedBrokerName', header: 'Assigned Broker', render: (v) => v ? String(v) : '— Unassigned —' },
            { key: 'maxExposure', header: 'Max Exposure', width: '140px', mono: true, align: 'right', render: (v) => `$${Number(v).toLocaleString()}` },
            { key: 'status', header: 'Status', width: '100px', render: (v) => <StatusBadge status={String(v)} /> },
          ]}
          data={accounts ?? []}
          loading={isLoading}
        />
      </div>

      <SlidePanel
        open={panelOpen}
        onClose={handleClosePanel}
        title="Add Execution Account"
        subtitle="Connect a backend LP execution account to route broker trades"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          
          <div style={sectionHeaderStyle}>Infrastructure Settings</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Account Name</label>
            <input
              type="text"
              required
              maxLength={100}
              placeholder="e.g. LMAX Prime Liquidity"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Provider / LP</label>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="e.g. LMAX"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Account Number</label>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="e.g. 770192"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Server/Bridge Address</label>
            <input
              type="text"
              required
              maxLength={200}
              placeholder="e.g. fix.lmax.com:443"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Max Exposure Limit (USD)</label>
            <input
              type="text"
              required
              placeholder="e.g. 1000000.00"
              value={maxExposure}
              onChange={(e) => setMaxExposure(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={sectionHeaderStyle}>LP Credentials</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>API Login / Key</label>
              <input
                type="text"
                required
                placeholder="login_username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Password / Secret</label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={isSubmitting}
              style={{ width: '100%' }}
            >
              {isSubmitting ? 'Connecting…' : 'Add Execution Account'}
            </Button>
          </div>
        </form>
      </SlidePanel>
    </div>
  )
}
