'use client'

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TradingClient } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchClients(): Promise<{ data: TradingClient[]; meta: { total: number } }> {
  const res = await fetch('/api/clients', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch clients')
  const body = await res.json() as { data: { data: TradingClient[]; meta: { total: number } } }
  return body.data
}

function DateCell({ dateString }: { dateString: string }) {
  const [fmt, setFmt] = useState('')
  useEffect(() => { setFmt(new Date(dateString).toLocaleDateString()) }, [dateString])
  return <span>{fmt || '—'}</span>
}

export default function BrokerClientsPage() {
  const [panelOpen, setPanelOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [externalClientId, setExternalClientId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [accountType, setAccountType] = useState<'standard' | 'ecn' | 'raw'>('standard')
  const [leverage, setLeverage] = useState('100')
  const [currency, setCurrency] = useState('USD')
  const [errMsg, setErrMsg] = useState('')

  const { data, isLoading, refetch } = useQuery({ queryKey: ['clients', 'list'], queryFn: fetchClients })
  const clients = data?.data ?? []
  const activeClients = clients.filter(c => c.isActive).length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrMsg('')
    const parsedLev = parseInt(leverage, 10)
    if (isNaN(parsedLev) || parsedLev < 1 || parsedLev > 500) { setErrMsg('Leverage must be 1–500'); return }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalClientId, firstName, lastName, email, accountType, leverage: parsedLev, currency: currency.toUpperCase() }),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})) as { message?: string }; throw new Error(err.message ?? 'Failed') }
      setPanelOpen(false)
      setExternalClientId(''); setFirstName(''); setLastName(''); setEmail('')
      setAccountType('standard'); setLeverage('100'); setCurrency('USD')
      refetch()
    } catch (err) { setErrMsg(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setIsSubmitting(false) }
  }

  const typeChip = (t: string): string => {
    const map: Record<string, string | undefined> = { standard: s.chipNeutral, ecn: s.chipTeal, raw: s.chipMag }
    return map[t] ?? s.chipNeutral ?? ''
  }

  return (
    <>

      {/* ─── Stat cards ─── */}
      <div className={s.statGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className={`${s.statCard} ${s.statCardAccentTeal}`}>
          <div className={s.statLabel}>Total Clients</div>
          <div className={s.statValue}>{isLoading ? '—' : clients.length}</div>
        </div>
        <div className={`${s.statCard} ${s.statCardAccentGreen}`}>
          <div className={s.statLabel}>Active Clients</div>
          <div className={s.statValue} style={{ color: '#10b981' }}>{isLoading ? '—' : activeClients}</div>
        </div>
        <div className={`${s.statCard}`}>
          <div className={s.statLabel}>Inactive</div>
          <div className={s.statValue} style={{ color: 'var(--text-muted)' }}>{isLoading ? '—' : clients.length - activeClients}</div>
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>All Clients</span>
          <span className={`${s.chip} ${s.chipNeutral}`}>{clients.length} records</span>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Client ID</th><th>First Name</th><th>Last Name</th>
                <th>Type</th><th>Leverage</th><th>CCY</th><th>Status</th><th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8}><div className={s.emptyState}><div className={s.spinner}/><div className={s.emptyText}>Loading clients…</div></div></td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className={s.emptyState}>
                    <div className={s.emptyIcon}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/></svg>
                    </div>
                    <div className={s.emptyText}>No clients registered yet</div>
                    <div className={s.emptySubtext}>Click <strong style={{color:'#3b82f6'}}>Register Client</strong> to get started</div>
                  </div>
                </td></tr>
              ) : clients.map(c => (
                <tr key={c.id}>
                  <td className={s.tableMono}>{c.externalClientId === 'ALGO_HOUSE' ? c.id.substring(0, 12) : c.externalClientId}</td>
                  <td>{c.firstName}</td>
                  <td>{c.lastName}</td>
                  <td><span className={`${s.chip} ${typeChip(c.accountType)}`}>{c.accountType.toUpperCase()}</span></td>
                  <td className={s.tableMono}>1:{c.leverage}</td>
                  <td className={s.tableMono}>{c.currency}</td>
                  <td>
                    <span className={`${s.chip} ${c.isActive ? s.chipGreen : s.chipNeutral}`}>
                      <span className={s.chipDot}/>{c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className={s.tableMono}><DateCell dateString={c.createdAt}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Register panel ─── */}
      {panelOpen && (
        <>
          <div className={s.panelOverlay} onClick={() => setPanelOpen(false)}/>
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div>
                <div className={s.panelTitle}>Register New Client</div>
                <p className={s.panelSubtitle}>Provision a retail trading account connected to LP</p>
              </div>
              <button className={s.panelClose} onClick={() => setPanelOpen(false)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={s.panelBody}>
              {errMsg && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ef4444', marginBottom: 16 }}>
                  {errMsg}
                </div>
              )}
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className={s.field}>
                  <label className={s.fieldLabel}>External Client ID</label>
                  <input className={s.input} required placeholder="e.g. MT5_221095" value={externalClientId} onChange={e => setExternalClientId(e.target.value)}/>
                </div>
                <div className={s.formRow}>
                  <div className={s.field}>
                    <label className={s.fieldLabel}>First Name</label>
                    <input className={s.input} required placeholder="John" value={firstName} onChange={e => setFirstName(e.target.value)}/>
                  </div>
                  <div className={s.field}>
                    <label className={s.fieldLabel}>Last Name</label>
                    <input className={s.input} required placeholder="Doe" value={lastName} onChange={e => setLastName(e.target.value)}/>
                  </div>
                </div>
                <div className={s.field}>
                  <label className={s.fieldLabel}>Account Type</label>
                  <select className={s.input} value={accountType} onChange={e => setAccountType(e.target.value as any)}>
                    <option value="standard">Standard</option>
                    <option value="ecn">ECN</option>
                    <option value="raw">Raw Spread</option>
                  </select>
                </div>
                <div className={s.formRow}>
                  <div className={s.field}>
                    <label className={s.fieldLabel}>Leverage (1–500)</label>
                    <input type="number" min={1} max={500} className={s.input} required value={leverage} onChange={e => setLeverage(e.target.value)}/>
                  </div>
                  <div className={s.field}>
                    <label className={s.fieldLabel}>Base Currency</label>
                    <input type="text" maxLength={3} className={s.input} required placeholder="USD" value={currency} onChange={e => setCurrency(e.target.value)}/>
                  </div>
                </div>
              </form>
            </div>
            <div className={s.panelFooter}>
              <button className={s.btnPrimary} disabled={isSubmitting} onClick={handleSubmit as any} style={{ width: '100%', justifyContent: 'center', height: 42 }}>
                {isSubmitting && <span className={s.spinner}/>}
                {isSubmitting ? 'Registering…' : 'Register Client'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
