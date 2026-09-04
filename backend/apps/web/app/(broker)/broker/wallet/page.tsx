'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { WalletSummary, WalletTransaction } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'
import { useTheme } from '@/providers/ThemeProvider'

async function fetchWallet(): Promise<WalletSummary> {
  const res = await fetch('/api/wallet', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as { data: WalletSummary }
  return body.data
}
async function fetchTransactions(): Promise<{ data: WalletTransaction[] }> {
  const res = await fetch('/api/wallet/transactions', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as { data: { data: WalletTransaction[] } }
  return body.data
}

function DateCell({ d }: { d: string }) {
  const [fmt, setFmt] = useState('')
  useEffect(() => { setFmt(new Date(d).toLocaleDateString()) }, [d])
  return <span>{fmt || '—'}</span>
}


type CurrencyKey = 'USDT'

async function fetchPositions(): Promise<any[]> {
  const res = await fetch('/api/positions?status=OPEN', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json() as { data: any[] }
  return body.data
}async function fetchBrokerProfile(): Promise<any> {
  const res = await fetch('/api/brokers/me', { credentials: 'include' })
  if (!res.ok) return null
  const body = await res.json()
  return body?.data ?? body
}

function WalletContent() {
  const { theme } = useTheme()
  const [depositOpen,  setDepositOpen]  = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [errMsg,       setErrMsg]       = useState('')

  const searchParams = useSearchParams()
  useEffect(() => {
    if (!searchParams) return
    const action = searchParams.get('action')
    if (action === 'deposit') {
      setDepositOpen(true)
    } else if (action === 'withdraw') {
      setWithdrawOpen(true)
    }
  }, [searchParams])

  const depositCurrency = 'USDT'
  const [depositAmount,    setDepositAmount]    = useState('')
  const [depositTxHash,    setDepositTxHash]    = useState('')
  const withdrawCurrency = 'USDT'
  const [withdrawAmount,   setWithdrawAmount]   = useState('')
  const [withdrawAddress,  setWithdrawAddress]  = useState('')
  const [withdrawTotp,     setWithdrawTotp]     = useState('')

  const [depositNetwork, setDepositNetwork] = useState<'TRC20' | 'ERC20'>('TRC20')
  const [depositAddresses, setDepositAddresses] = useState<{ USDT_TRC20: string; USDT_ERC20: string } | null>(null)

  useEffect(() => {
    if (depositOpen) {
      fetch('/api/wallet/deposit-addresses', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => setDepositAddresses(data.data || data))
        .catch((err) => console.error('Failed to fetch deposit addresses:', err))
    }
  }, [depositOpen])

  const { data: wallet, isLoading: walletLoading, refetch: refetchWallet } = useQuery({ queryKey: ['wallet','summary'], queryFn: fetchWallet })
  const { data: txs,    isLoading: txsLoading,    refetch: refetchTxs    } = useQuery({ queryKey: ['wallet','transactions'], queryFn: fetchTransactions })
  const { data: positions } = useQuery({ queryKey: ['positions','wallet-open'], queryFn: fetchPositions, refetchInterval: 5000 })
  const { data: brokerProfile } = useQuery({ queryKey: ['broker','profile-wallet'], queryFn: fetchBrokerProfile })

  const isMfaEnabled = Boolean(brokerProfile?.mfaEnabled)

  const available = wallet ? parseFloat(wallet.availableCreditUSD) : 0
  const used      = wallet ? parseFloat(wallet.usedCreditUSD) : 0
  const total     = wallet ? parseFloat(wallet.totalCreditUSD) : 0

  // Calculate wallet combined crypto balance
  const usdt = wallet ? parseFloat(wallet.balances?.USDT ?? '0') : 0
  const usdc = wallet ? parseFloat(wallet.balances?.USDC ?? '0') : 0
  const btc = wallet ? parseFloat(wallet.balances?.BTC ?? '0') : 0
  const eth = wallet ? parseFloat(wallet.balances?.ETH ?? '0') : 0
  const totalCryptoBalanceUSD = usdt + usdc + (btc * 60000) + (eth * 3000)

  const mergedWalletBalance = usdt
  const marginPct = mergedWalletBalance > 0 ? (used / mergedWalletBalance) * 100 : 0

  const tradingExposure = positions?.reduce((acc, p) => {
    const price = parseFloat(p.openPrice)
    const vol = parseFloat(p.volume)
    const size = Number(p.symbol?.contractSize ?? 100000)
    return acc + (price * vol * size)
  }, 0) ?? 0

  // Suspend service notice if no credit limit AND no wallet assets
  const isSuspended = wallet && total <= 0 && usdt <= 0

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!depositAmount || isNaN(parseFloat(depositAmount)) || parseFloat(depositAmount) <= 0) {
      setErrMsg('Please enter a valid amount')
      return
    }
    if (!depositTxHash.trim()) {
      setErrMsg('Transaction hash is required')
      return
    }

    setSubmitting(true)
    setErrMsg('')
    try {
      const res = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(depositAmount),
          currency: 'USDT',
          txHash: depositTxHash.trim(),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message ?? 'Deposit submission failed')
      }

      alert('Deposit submitted! The administrator will verify and approve it shortly.')
      setDepositOpen(false)
      setDepositAmount('')
      setDepositTxHash('')
      refetchTxs()
      refetchWallet()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!withdrawAmount || isNaN(parseFloat(withdrawAmount)) || parseFloat(withdrawAmount) <= 0) {
      setErrMsg('Please enter a valid amount')
      return
    }
    if (!withdrawAddress.trim()) {
      setErrMsg('Recipient address is required')
      return
    }
    if (isMfaEnabled && !withdrawTotp.trim()) {
      setErrMsg('2FA code is required')
      return
    }

    setSubmitting(true)
    setErrMsg('')
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: withdrawAmount.trim(),
          currency: 'USDT',
          destinationAddress: withdrawAddress.trim(),
          totpCode: isMfaEnabled ? withdrawTotp.trim() : '',
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message ?? 'Withdrawal failed')
      }

      alert('Withdrawal request submitted for admin review.')
      setWithdrawOpen(false)
      setWithdrawAmount('')
      setWithdrawAddress('')
      setWithdrawTotp('')
      refetchTxs()
      refetchWallet()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const txStatusChip = (status: string): string => {
    const m: Record<string, string | undefined> = { PENDING: s.chipAmber, CONFIRMED: s.chipGreen, REJECTED: s.chipRed, APPROVED: s.chipGreen, COMPLETED: s.chipTeal }
    return m[status] ?? s.chipNeutral ?? ''
  }

  const txTypeChip = (type: string): string => type === 'DEPOSIT' ? (s.chipGreen ?? '') : (s.chipRed ?? '')


  return (
    <div className={s.walletWrapper}>
      {/* Background Soft Blobs */}
      <div className={s.blurBlob1} />
      <div className={s.blurBlob2} />

      {/* ─── Header ─── */}
      <div className={s.pageHeader} style={{ position: 'relative', zIndex: 5, justifyContent: 'flex-end' }}>
        <div className={s.pageActions}>
          <button className={s.btnOutline} onClick={() => { setErrMsg(''); setWithdrawOpen(true) }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Withdraw
          </button>
          <button className={s.btnPrimary} onClick={() => { setErrMsg(''); setDepositOpen(true) }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Deposit Crypto
          </button>
        </div>
      </div>

      {/* ─── Deactivation notice banner (No credit AND no balance) ─── */}
      {isSuspended && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 16,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ef4444',
            flexShrink: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Account Suspended</div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
              Your broker profile has no active credit limit or wallet balance. Trading service is offline. Please deposit crypto or request a credit allocation from the administrator to restore liquidity.
            </p>
          </div>
        </div>
      )}

      {/* ─── Equity & Exposure utilisation card ─── */}
      <div className={s.card} style={{ marginBottom: 20, position: 'relative', zIndex: 1 }}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle} style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 16, letterSpacing: '-0.01em', textTransform: 'none' }}>Equity &amp; Exposure Utilisation</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', fontFamily: "'Space Grotesk', sans-serif" }}>{marginPct.toFixed(1)}%</span>
        </div>
        <div className={s.cardBody}>
          <div className={s.creditBar}>
            <div className={s.creditBarFill} style={{ width: `${marginPct}%` }}/>
          </div>
          <div className={s.walletGrid} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {[
              { label: 'Equity',           value: `$${available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { label: 'Balance',          value: `$${mergedWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              { label: 'Used Margin',       value: `$${used.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`      },
              { label: 'Trading Exposure',  value: `$${tradingExposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            ].map(item => (
              <div key={item.label} className={s.walletMetricCard}>
                <div className={s.walletMetricLabel}>{item.label}</div>
                <div className={s.walletMetricValue}>{walletLoading ? '—' : item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Transaction history ─── */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>Transaction History</span>
          <span className={`${s.chip} ${s.chipNeutral}`}>{txs?.data?.length ?? 0} records</span>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr><th>Type</th><th>Currency</th><th>Amount</th><th>USD Value</th><th>Tx Hash</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {txsLoading ? (
                <tr><td colSpan={7}><div className={s.emptyState}><div className={s.spinner}/><div className={s.emptyText}>Loading…</div></div></td></tr>
              ) : (txs?.data?.length ?? 0) === 0 ? (
                <tr><td colSpan={7}>
                  <div className={s.emptyState}>
                    <div className={s.emptyIcon}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div>
                    <div className={s.emptyText}>No transactions yet</div>
                  </div>
                </td></tr>
              ) : txs?.data?.map(tx => (
                <tr key={tx.id}>
                  <td><span className={`${s.chip} ${txTypeChip(tx.type)}`}><span className={s.chipDot}/>{tx.type}</span></td>
                  <td className={s.tableMono}>{tx.currency}</td>
                  <td className={s.tableMono}>{Number(tx.amount).toFixed(2)}</td>
                  <td className={s.tableMono}>${Number(tx.amountUSD).toFixed(2)}</td>
                  <td className={s.tableMono} style={{ color: 'var(--text-muted)', fontSize: 11 }}>{tx.txHash ? tx.txHash.substring(0,16) + '…' : '—'}</td>
                  <td><span className={`${s.chip} ${txStatusChip(tx.status)}`}>{tx.status}</span></td>
                  <td className={s.tableMono}><DateCell d={tx.createdAt}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Deposit panel ─── */}
      {depositOpen && (
        <>
          <div className={s.panelOverlay} onClick={() => setDepositOpen(false)}/>
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div>
                <div className={s.panelTitle}>Deposit Crypto</div>
                <p className={s.panelSubtitle}>Supported: USDT — converts to trading credit</p>
              </div>
              <button className={s.panelClose} onClick={() => setDepositOpen(false)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={s.panelBody}>
              {errMsg && <div style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#f87171', marginBottom:14 }}>{errMsg}</div>}
              <form onSubmit={handleDeposit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className={s.field}>
                  <label className={s.fieldLabel}>Asset Currency</label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 600
                  }}>
                    <span style={{ fontSize: 16 }}>🪙</span> USDT — Tether
                  </div>
                </div>
                <div className={s.field}>
                  <label className={s.fieldLabel}>Deposit Network</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    {(['TRC20', 'ERC20'] as const).map((net) => (
                      <button
                        key={net}
                        type="button"
                        onClick={() => setDepositNetwork(net)}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: 10,
                          border: depositNetwork === net
                            ? '1.5px solid var(--text-accent)'
                            : '1.5px solid var(--border-strong)',
                          background: depositNetwork === net
                            ? 'var(--sidebar-item-active)'
                            : 'var(--input-bg)',
                          color: depositNetwork === net ? 'var(--text-accent)' : 'var(--text-muted)',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          letterSpacing: 0.3,
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>USDT</div>
                        <div style={{ fontSize: 10, marginTop: 2, opacity: 0.85 }}>{net}</div>
                        {depositNetwork === net && (
                          <div style={{ marginTop: 4, fontSize: 9, color: 'var(--text-success)', letterSpacing: 0.5 }}>● SELECTED</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 16,
                  padding: '24px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '-50px',
                    left: '-50px',
                    width: 150,
                    height: 150,
                    background: 'radial-gradient(circle, var(--glow-color1, rgba(96,205,246,0.15)) 0%, transparent 70%)',
                    pointerEvents: 'none'
                  }} />

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                      Scan QR Code to Pay
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      Send USDT via {depositNetwork} network only
                    </span>
                  </div>

                  {depositAddresses ? (
                    (() => {
                      const addr = depositNetwork === 'TRC20' ? depositAddresses.USDT_TRC20 : depositAddresses.USDT_ERC20
                      if (!addr) {
                        return <span style={{ color: '#f87171', fontStyle: 'italic', fontSize: 12 }}>Address not configured — contact admin</span>
                      }
                      
                      const qrColor = theme === 'light' ? '0f172a' : 'ffffff'
                      const qrBg = theme === 'light' ? 'ffffff' : '151828'
                      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=${qrColor}&bgcolor=${qrBg}&data=${encodeURIComponent(addr)}`
                      
                      return (
                        <>
                          <div style={{
                            background: theme === 'light' ? '#ffffff' : '#151828',
                            padding: 16,
                            borderRadius: 14,
                            border: '1px solid var(--border-default)',
                            boxShadow: 'var(--shadow-md)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            position: 'relative'
                          }}
                            title="Click to copy address"
                            onClick={() => {
                              navigator.clipboard.writeText(addr).then(() => {
                                alert('Wallet address copied to clipboard!')
                              })
                            }}
                          >
                            <img 
                              src={qrUrl} 
                              alt="Deposit QR Code" 
                              style={{ width: 160, height: 160, borderRadius: 6 }} 
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(addr).then(() => {
                                alert('Wallet address copied to clipboard!')
                              })
                            }}
                            style={{
                              background: 'var(--input-bg)',
                              border: '1px solid var(--border-default)',
                              borderRadius: 8,
                              padding: '6px 16px',
                              color: 'var(--text-secondary)',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <span>⎘</span> Copy Address
                          </button>
                        </>
                      )
                    })()
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 11, padding: '40px 0' }}>
                      <span className={s.spinner} style={{ width: 14, height: 14 }}/> Loading QR...
                    </div>
                  )}
                </div>

                <div className={s.field}>
                  <label className={s.fieldLabel}>Amount</label>
                  <input type="number" step="any" className={s.input} required placeholder="e.g. 1000.00" value={depositAmount} onChange={e => setDepositAmount(e.target.value)}/>
                </div>
                <div className={s.field}>
                  <label className={s.fieldLabel}>Transaction Hash</label>
                  <input type="text" className={s.input} required placeholder="On-chain Tx ID / Hash" value={depositTxHash} onChange={e => setDepositTxHash(e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}/>
                </div>
              </form>
            </div>
            <div className={s.panelFooter}>
              <button className={s.btnPrimary} disabled={submitting} onClick={handleDeposit as any} style={{ width:'100%', justifyContent:'center', height:42 }}>
                {submitting && <span className={s.spinner}/>}
                {submitting ? 'Submitting…' : 'Submit Deposit'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Withdraw panel ─── */}
      {withdrawOpen && (
        <>
          <div className={s.panelOverlay} onClick={() => setWithdrawOpen(false)}/>
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div>
                <div className={s.panelTitle}>Withdraw Crypto</div>
                <p className={s.panelSubtitle}>Subject to available credit. 2FA code required.</p>
              </div>
              <button className={s.panelClose} onClick={() => setWithdrawOpen(false)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={s.panelBody}>
              {errMsg && <div style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#f87171', marginBottom:14 }}>{errMsg}</div>}
              
              {!isMfaEnabled ? (
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 10, padding: 18, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 6 }}>2FA Security Required</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
                    Two-Factor Authentication (2FA) is mandatory for submitting withdrawal requests. Please activate 2FA in your Account Settings to proceed.
                  </p>
                  <button
                    className={s.btnPrimary}
                    onClick={() => { setWithdrawOpen(false); window.location.href = '/broker/settings' }}
                    style={{ width: '100%', justifyContent: 'center', height: 42, background: '#ef4444', borderColor: '#ef4444' }}
                  >
                    Go to Settings &amp; Enable 2FA
                  </button>
                </div>
              ) : (
                <form onSubmit={handleWithdraw} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div className={s.field}>
                    <label className={s.fieldLabel}>Asset Currency</label>
                    <input type="text" className={s.input} value="USDT — Tether" readOnly style={{ opacity: 0.8, cursor: 'not-allowed' }} />
                  </div>
                  <div className={s.field}>
                    <label className={s.fieldLabel}>Amount</label>
                    <input type="number" step="any" className={s.input} required placeholder="e.g. 500.00" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}/>
                  </div>
                  <div className={s.field}>
                    <label className={s.fieldLabel}>Destination Wallet Address</label>
                    <input type="text" className={s.input} required placeholder="Crypto wallet address" value={withdrawAddress} onChange={e => setWithdrawAddress(e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}/>
                  </div>
                  <div className={s.field}>
                    <label className={s.fieldLabel}>2FA TOTP Code</label>
                    <input type="text" className={s.input} required maxLength={6} placeholder="6-digit code" value={withdrawTotp} onChange={e => setWithdrawTotp(e.target.value)} style={{ fontFamily: 'var(--font-mono)', textAlign:'center', letterSpacing:'0.3em', fontSize:18, fontWeight:700 }}/>
                  </div>
                </form>
              )}
            </div>
            {isMfaEnabled && (
              <div className={s.panelFooter}>
                <button className={s.btnDanger} disabled={submitting} onClick={handleWithdraw as any} style={{ width:'100%', justifyContent:'center', height:42 }}>
                  {submitting && <span className={s.spinner}/>}
                  {submitting ? 'Submitting…' : 'Submit Withdrawal'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function BrokerWalletPage() {
  return (
    <Suspense fallback={null}>
      <WalletContent />
    </Suspense>
  )
}
