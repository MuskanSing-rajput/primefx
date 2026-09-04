'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchSettings(): Promise<any[]> {
  const res = await fetch('/api/admin/settings', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as any
  return Array.isArray(body) ? body : (body?.data ?? (Array.isArray(body) ? body : []))
}

async function fetchTransactions(): Promise<{ data: any[] }> {
  const res = await fetch('/api/admin/transactions', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  return res.json()
}

export default function AdminSettingsPage() {
  const { data: settings, isLoading: settingsLoading, refetch: refetchSettings } = useQuery({ queryKey: ['admin','settings'], queryFn: fetchSettings })
  const { data: txs, isLoading: txsLoading } = useQuery({ queryKey: ['admin','transactions'], queryFn: fetchTransactions })

  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const [metaApiToken, setMetaApiToken] = useState('')
  const [savingToken, setSavingToken] = useState(false)

  const handleToggleAsset = async (key: string, currentValue: string) => {
    setTogglingKey(key)
    setSuccessMsg('')
    const nextValue = currentValue === 'true' ? 'false' : 'true'
    try {
      const res = await fetch(`/api/admin/settings/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: nextValue }),
      })
      if (!res.ok) throw new Error('Failed to update setting')
      setSuccessMsg(`System configuration updated!`)
      refetchSettings()
    } catch (err) {
      console.error(err)
    } finally {
      setTogglingKey(null)
    }
  }

  const handleSaveMetaApiToken = async () => {
    setSavingToken(true)
    setSuccessMsg('')
    try {
      const res = await fetch(`/api/admin/settings/metaapi_master_token`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: metaApiToken }),
      })
      if (!res.ok) throw new Error('Failed to save MetaAPI token')
      setSuccessMsg('MetaAPI Master Token saved successfully!')
      refetchSettings()
    } catch (err) {
      console.error(err)
      alert('Failed to save MetaAPI token')
    } finally {
      setSavingToken(false)
    }
  }

  const [usdtTrc20, setUsdtTrc20] = useState('')
  const [usdtErc20, setUsdtErc20] = useState('')
  const [savingAddresses, setSavingAddresses] = useState(false)

  const getSettingValue = (key: string): string => {
    const list = Array.isArray(settings) ? settings : (settings as any)?.data ?? []
    if (!Array.isArray(list)) return ''
    const sItem = list.find((x: any) => x.key === key)
    return sItem ? sItem.value : ''
  }

  const handleSaveAddresses = async () => {
    setSavingAddresses(true)
    setSuccessMsg('')
    try {
      const updateKey = async (key: string, val: string) => {
        const res = await fetch(`/api/admin/settings/${key}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: val }),
        })
        if (!res.ok) throw new Error(`Failed to save ${key}`)
      }
      await Promise.all([
        updateKey('usdt_trc20_address', usdtTrc20.trim()),
        updateKey('usdt_erc20_address', usdtErc20.trim()),
      ])
      setSuccessMsg('USDT Receiving Wallet Addresses saved successfully!')
      refetchSettings()
    } catch (err) {
      console.error(err)
      alert('Failed to save receiving addresses')
    } finally {
      setSavingAddresses(false)
    }
  }

  React.useEffect(() => {
    if (settings) {
      setMetaApiToken(getSettingValue('metaapi_master_token'))
      setUsdtTrc20(getSettingValue('usdt_trc20_address'))
      setUsdtErc20(getSettingValue('usdt_erc20_address'))
    }
  }, [settings])

  const txStatusChip = (status: string): string => {
    const m: Record<string, string | undefined> = { PENDING: s.chipAmber, CONFIRMED: s.chipGreen, REJECTED: s.chipRed, APPROVED: s.chipGreen, COMPLETED: s.chipTeal }
    return m[status] ?? s.chipNeutral ?? ''
  }

  const txTypeChip = (type: string): string => type === 'DEPOSIT' ? (s.chipGreen ?? '') : (s.chipRed ?? '')

  if (settingsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className={s.spinner} />
      </div>
    )
  }

  const assets = [
    { key: 'USDT', label: 'Tether USD (USDT)', icon: 'U', color: '#2ec77f' },
    { key: 'BTC',  label: 'Bitcoin (BTC)',      icon: 'B', color: '#f5a623' },
    { key: 'ETH',  label: 'Ethereum (ETH)',     icon: 'E', color: '#4a90e2' },
    { key: 'USDC', label: 'USD Coin (USDC)',    icon: 'U', color: '#2775ca' },
  ]

  return (
    <div style={{ padding: '0 8px' }}>
      {/* ─── Header ─── */}
      <div className={s.pageHeader}>
        <div className={s.pageHeaderLeft}>
          <div className={s.breadcrumb}>
            <span className={s.breadcrumbItem}>PrimeFX</span>
            <span className={s.breadcrumbSep}>›</span>
            <span className={s.breadcrumbItem}>Admin</span>
            <span className={s.breadcrumbSep}>›</span>
            <span className={`${s.breadcrumbItem} ${s.breadcrumbItemActive}`}>Settings</span>
          </div>
        </div>
      </div>

      {successMsg && (
        <div style={{ padding: '10px 14px', background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)', color: '#2dd4bf', borderRadius: 8, fontSize: 12, marginBottom: 16 }}>
          ✓ {successMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'start', marginBottom: 20 }}>
        {/* LEFT COLUMN: Asset Management & Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Cryptocurrency Activation Panel */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>Global Crypto Liquidity Management</span>
            </div>
            <div className={s.cardBody} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 12, color: 'var(--cp-muted)', lineHeight: 1.5, marginBottom: 4 }}>
                Deactivating a cryptocurrency suspends all deposit registration and withdrawal processing for all active brokers.
              </p>
              {assets.map(asset => {
                const key = `crypto_active_${asset.key}`
                const val = getSettingValue(key)
                const isActive = val === 'true'
                const isToggling = togglingKey === key

                return (
                  <div key={asset.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--cp-s2)', borderRadius: 10, border: '1px solid var(--cp-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: asset.color, border: `1px solid ${asset.color}44` }}>
                        {asset.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cp-text)' }}>{asset.label}</div>
                        <div style={{ fontSize: 11, color: isActive ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                          {isActive ? '● Active Liquidity' : '○ Suspended'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleAsset(key, val)}
                      disabled={isToggling}
                      className={isActive ? s.btnOutline : s.btnPrimary}
                      style={{
                        padding: '6px 12px',
                        fontSize: 11,
                        background: isToggling ? 'var(--cp-border)' : isActive ? 'transparent' : 'var(--cp-btn-primary)',
                        borderColor: isActive ? '#ef4444' : 'var(--cp-btn-primary)',
                        color: isActive ? '#ef4444' : 'var(--cp-text)',
                      }}
                    >
                      {isToggling ? 'Updating...' : isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* USDT Receiving Wallet Addresses */}
          <div className={s.card} style={{ marginTop: 20 }}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>USDT Receiving Wallet Addresses</span>
            </div>
            <div className={s.cardBody} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 12, color: 'var(--cp-muted)', lineHeight: 1.5 }}>
                Configure the receiving wallet addresses shown to brokers on the deposit request panel.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 6, fontFamily: 'var(--cp-mono)' }}>USDT TRC20 Address</label>
                <input
                  type="text"
                  className={s.input}
                  value={usdtTrc20}
                  onChange={(e) => setUsdtTrc20(e.target.value)}
                  placeholder="TRC20 Wallet Address (e.g. TR7NH...)"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 6, fontFamily: 'var(--cp-mono)' }}>USDT ERC20 Address</label>
                <input
                  type="text"
                  className={s.input}
                  value={usdtErc20}
                  onChange={(e) => setUsdtErc20(e.target.value)}
                  placeholder="ERC20 Wallet Address (e.g. 0x...)"
                  style={{ width: '100%' }}
                />
              </div>
              <button
                onClick={handleSaveAddresses}
                disabled={savingAddresses}
                className={s.btnPrimary}
                style={{ width: '100%', height: 38, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 6 }}
              >
                {savingAddresses && <span className={s.spinner} style={{ marginRight: 8 }} />}
                {savingAddresses ? 'Saving Addresses...' : 'Save Wallet Addresses'}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Mock Risk & Validation Parameters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className={s.card}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>Global Risk &amp; Validation Controls</span>
            </div>
            <div className={s.cardBody} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 6, fontFamily: 'var(--cp-mono)' }}>Execution Validation</label>
                <select className={s.input} style={{ width: '100%' }}>
                  <option>Enabled (Verify deviations)</option>
                  <option>Disabled (Auto-match all)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 6, fontFamily: 'var(--cp-mono)' }}>Max Price Slippage (Pips)</label>
                <input type="text" className={s.input} defaultValue="3.0 Pips" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 6, fontFamily: 'var(--cp-mono)' }}>Max Broker Exposure Limit</label>
                <input type="text" className={s.input} defaultValue={getSettingValue('max_broker_exposure') || '$10,000,000'} style={{ width: '100%' }} />
              </div>
            </div>
          </div>

          <div className={s.card} style={{ marginTop: 20 }}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>MetaAPI Integration Config</span>
            </div>
            <div className={s.cardBody} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                Configure the platform's central MetaAPI Master Token to enable MT5 Managed Connections for brokers.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 6, fontFamily: 'var(--cp-mono)' }}>MetaAPI Master Token</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    className={s.input}
                    value={metaApiToken}
                    onChange={(e) => setMetaApiToken(e.target.value)}
                    placeholder="Paste MetaAPI Master Token here..."
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={handleSaveMetaApiToken}
                    disabled={savingToken}
                    className={s.btnPrimary}
                    style={{ height: 38, padding: '0 16px', fontSize: 12, display: 'flex', alignItems: 'center' }}
                  >
                    {savingToken ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TRANSACTION HISTORY TAB: Log of all broker deposits & withdrawals */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>Global Platform Transaction Audit Log</span>
          <span className={`${s.chip} ${s.chipNeutral}`}>{txs?.data?.length ?? 0} transactions</span>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Brokerage</th>
                <th>Type</th>
                <th>Currency</th>
                <th>Amount</th>
                <th>USD Value</th>
                <th>Tx Hash</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {txsLoading ? (
                <tr><td colSpan={8}><div className={s.emptyState}><div className={s.spinner}/><div className={s.emptyText}>Loading logs…</div></div></td></tr>
              ) : (txs?.data?.length ?? 0) === 0 ? (
                <tr><td colSpan={8}>
                  <div className={s.emptyState}>
                    <div className={s.emptyText}>No transaction records found on platform</div>
                  </div>
                </td></tr>
              ) : txs?.data?.map((tx: any) => (
                <tr key={tx.id}>
                  <td style={{ fontWeight: 700 }}>{tx.wallet?.broker?.companyName ?? '—'}</td>
                  <td><span className={`${s.chip} ${txTypeChip(tx.type)}`}><span className={s.chipDot}/>{tx.type}</span></td>
                  <td className={s.tableMono}>{tx.currency}</td>
                  <td className={s.tableMono}>{Number(tx.amount).toFixed(8)}</td>
                  <td className={s.tableMono}>${Number(tx.amountUSD).toFixed(2)}</td>
                  <td className={s.tableMono} style={{ color: 'var(--cp-muted)', fontSize: 11 }}>{tx.txHash ? tx.txHash.substring(0,16) + '…' : '—'}</td>
                  <td><span className={`${s.chip} ${txStatusChip(tx.status)}`}>{tx.status}</span></td>
                  <td className={s.tableMono}>{new Date(tx.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
