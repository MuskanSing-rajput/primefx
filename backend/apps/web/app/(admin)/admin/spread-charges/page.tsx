'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

interface Broker {
  id: string
  companyName: string
  contactName: string
  email: string
  executionAccountId: string | null
}

interface SymbolSpreadRow {
  symbolId: string
  symbolName: string
  displayName: string
  category: string
  digits: number
  rawBid: string | null
  rawAsk: string | null
  rawSpread: string | null
  rawTs: string | null
  markupPips: number
  hasCustomOverride: boolean
}

interface SpreadConfig {
  brokerId: string
  brokerName: string
  globalMarkupPips: number
  commissionPerLot: number
  marginCallPercent: number
  stopoutPercent: number
  priceSourceAccountId: string | null
  symbols: SymbolSpreadRow[]
}

interface MonthlyRow {
  month: string
  lots: number
  commission: number
  orders: number
}

interface ChargesData {
  brokerId: string
  commissionPerLot: number
  totalLpRevenue: number
  totalLots: number
  totalOrders: number
  monthlyBreakdown: MonthlyRow[]
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...opts?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  const payload = await res.json()
  return payload.data
}

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function computeFinalBidAsk(
  rawBid: string | null,
  rawAsk: string | null,
  markupPips: number,
  digits: number,
  symbolName: string
) {
  if (!rawBid || !rawAsk) return { bid: '—', ask: '—', spread: '—' }

  const PIP_SIZES: Record<string, number> = {
    EURUSD: 0.0001, GBPUSD: 0.0001, USDJPY: 0.01, AUDUSD: 0.0001, NZDUSD: 0.0001,
    EURNZD: 0.0001, GBPNZD: 0.0001, EURAUD: 0.0001, GBPAUD: 0.0001, AUDJPY: 0.01,
    GBPJPY: 0.01, CADJPY: 0.01, XAUUSD: 0.1, XAGUSD: 0.001, XAUEUR: 0.1,
    XAGAUD: 0.001, BTCUSD: 1.0, ETHUSD: 0.1, LTCUSD: 0.01, XRPUSD: 0.0001,
    UNIUSD: 0.0001,
  }

  const pipSize = PIP_SIZES[symbolName] ?? Math.pow(10, -(digits - 1))
  const halfMarkup = (markupPips * pipSize) / 2

  const bid = (parseFloat(rawBid) - halfMarkup).toFixed(digits)
  const ask = (parseFloat(rawAsk) + halfMarkup).toFixed(digits)
  const spread = (parseFloat(ask) - parseFloat(bid)).toFixed(digits)
  return { bid, ask, spread }
}

export default function SpreadChargesPage() {
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'spread' | 'charges'>('spread')

  const [spreadConfig, setSpreadConfig] = useState<SpreadConfig | null>(null)
  const [globalMarkup, setGlobalMarkup] = useState<number>(0)
  const [symbolOverrides, setSymbolOverrides] = useState<Map<string, number>>(new Map())
  const [spreadSaving, setSpreadSaving] = useState(false)
  const [spreadMsg, setSpreadMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [chargesData, setChargesData] = useState<ChargesData | null>(null)
  const [commissionRate, setCommissionRate] = useState<number>(0)
  const [freeLotsThreshold, setFreeLotsThreshold] = useState<number>(0)
  const [chargesSaving, setChargesSaving] = useState(false)
  const [chargesMsg, setChargesMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [liveTs, setLiveTs] = useState(Date.now())
  const [mounted, setMounted] = useState(false)
  const [marginCall, setMarginCall] = useState<number>(100)
  const [stopout, setStopout] = useState<number>(50)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    apiFetch('/admin/spread-charges/brokers')
      .then((data: Broker[]) => {
        if (Array.isArray(data)) {
          setBrokers(data)
          if (data.length > 0 && data[0]) setSelectedBrokerId(data[0].id)
        } else {
          setBrokers([])
        }
      })
      .catch((err) => {
        console.error(err)
        setBrokers([])
      })
  }, [])

  const loadSpreadConfig = useCallback(async () => {
    if (!selectedBrokerId) return
    try {
      const data: SpreadConfig = await apiFetch(`/admin/spread-charges/${selectedBrokerId}/spread`)
      setSpreadConfig(data)
      setGlobalMarkup(data.globalMarkupPips)
      setMarginCall(data.marginCallPercent ?? 100)
      setStopout(data.stopoutPercent ?? 50)
      const overrides = new Map<string, number>()
      data.symbols.forEach((s) => { if (s.hasCustomOverride) overrides.set(s.symbolName, s.markupPips) })
      setSymbolOverrides(overrides)
    } catch (e: any) { console.error(e) }
  }, [selectedBrokerId])

  const loadCharges = useCallback(async () => {
    if (!selectedBrokerId) return
    try {
      const data: ChargesData & { freeLotsThreshold?: number } = await apiFetch(`/admin/spread-charges/${selectedBrokerId}/charges`)
      setChargesData(data)
      setCommissionRate(data.commissionPerLot)
      setFreeLotsThreshold(data.freeLotsThreshold ?? 0)
    } catch (e: any) { console.error(e) }
  }, [selectedBrokerId])

  useEffect(() => {
    loadSpreadConfig()
    loadCharges()
  }, [loadSpreadConfig, loadCharges])

  useEffect(() => {
    if (activeTab !== 'spread' || !selectedBrokerId) return
    const timer = setInterval(() => {
      apiFetch(`/admin/spread-charges/${selectedBrokerId}/spread`)
        .then((data: SpreadConfig) => {
          setSpreadConfig(data)
          setLiveTs(Date.now())
        })
        .catch(() => {})
    }, 2000)
    return () => clearInterval(timer)
  }, [activeTab, selectedBrokerId])

  const handleSaveSpread = async () => {
    if (!selectedBrokerId) return
    setSpreadSaving(true); setSpreadMsg(null)
    try {
      const overridesArr = Array.from(symbolOverrides.entries()).map(([symbolName, markupPips]) => ({ symbolName, markupPips }))
      await apiFetch(`/admin/spread-charges/${selectedBrokerId}/spread`, {
        method: 'POST',
        body: JSON.stringify({
          globalMarkupPips: globalMarkup,
          commissionPerLot: chargesData?.commissionPerLot ?? 0,
          marginCallPercent: Number(marginCall),
          stopoutPercent: Number(stopout),
          symbolOverrides: overridesArr
        }),
      })
      setSpreadMsg({ type: 'ok', text: 'Spread config saved and live stream updated!' })
      loadSpreadConfig()
    } catch (e: any) { setSpreadMsg({ type: 'err', text: e.message }) }
    finally { setSpreadSaving(false) }
  }

  const handleSaveCharges = async () => {
    if (!selectedBrokerId) return
    setChargesSaving(true); setChargesMsg(null)
    try {
      await apiFetch(`/admin/spread-charges/${selectedBrokerId}/charges`, {
        method: 'POST',
        body: JSON.stringify({
          commissionPerLot: commissionRate,
          freeLotsThreshold: freeLotsThreshold,
        }),
      })
      setChargesMsg({ type: 'ok', text: 'Commission settings saved successfully!' })
      loadCharges()
    } catch (e: any) { setChargesMsg({ type: 'err', text: e.message }) }
    finally { setChargesSaving(false) }
  }

  const getSymbolMarkup = (sym: SymbolSpreadRow) => symbolOverrides.has(sym.symbolName) ? symbolOverrides.get(sym.symbolName)! : globalMarkup

  const setSymbolOverride = (symbolName: string, pips: number) => {
    setSymbolOverrides(prev => { const next = new Map(prev); next.set(symbolName, pips); return next })
  }

  const clearSymbolOverride = (symbolName: string) => {
    setSymbolOverrides(prev => { const next = new Map(prev); next.delete(symbolName); return next })
  }

  const selectedBroker = Array.isArray(brokers) ? brokers.find((b) => b.id === selectedBrokerId) : undefined

  const mergedMonthlyRows = useMemo(() => {
    if (!chargesData) return []
    const ledger = (chargesData as any).ledger || []
    const breakdown = chargesData.monthlyBreakdown || []

    const rows: {
      month: string
      totalLots: number
      freeLots: number
      chargedLots: number
      commission: number
      orders?: number
    }[] = []

    // 1. Add all ledger records
    ledger.forEach((l: any) => {
      rows.push({
        month: l.billingMonth,
        totalLots: l.totalLotsTraded,
        freeLots: l.freeLotsUsed,
        chargedLots: l.chargeableLots,
        commission: l.totalCommission,
      })
    })

    // 2. Add historical breakdown records if not present in ledger
    breakdown.forEach((b) => {
      if (!rows.some((r) => r.month === b.month)) {
        rows.push({
          month: b.month,
          totalLots: b.lots,
          freeLots: 0,
          chargedLots: b.lots,
          commission: b.commission,
          orders: b.orders,
        })
      }
    })

    // Sort descending by month
    return rows.sort((a, b) => b.month.localeCompare(a.month))
  }, [chargesData])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 6 }}>
            Spread & Charges
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            Configure LP markup spread and commission per broker. Changes apply live to WebSocket price streams instantly.
          </p>
        </div>

        {/* Broker Selector */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth={1.8}>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Select Broker:</label>
          <select
            value={selectedBrokerId}
            onChange={(e) => setSelectedBrokerId(e.target.value)}
            style={{ flex: 1, maxWidth: 380, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, cursor: 'pointer', outline: 'none' }}
          >
            {(!Array.isArray(brokers) || brokers.length === 0) && <option value="">No approved brokers</option>}
            {Array.isArray(brokers) && brokers.map((b) => <option key={b.id} value={b.id}>{b.companyName}</option>)}
          </select>
          {selectedBroker && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedBroker.email}</span>
              <div style={{ padding: '4px 10px', borderRadius: 20, background: selectedBroker.executionAccountId ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: selectedBroker.executionAccountId ? '#22c55e' : '#ef4444', fontSize: 11, fontWeight: 600 }}>
                {selectedBroker.executionAccountId ? 'MT5 Connected' : 'No MT5'}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-card)', borderRadius: 10, padding: 4, border: '1px solid var(--border-primary)', width: 'fit-content' }}>
          {(['spread', 'charges'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 24px', borderRadius: 7, border: 'none', background: activeTab === tab ? 'var(--accent-primary)' : 'transparent', color: activeTab === tab ? '#fff' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
              {tab === 'spread' ? '📈 Spread' : '💰 Charges'}
            </button>
          ))}
        </div>

        {/* SPREAD TAB */}
        {activeTab === 'spread' && (
          <div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '20px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Global Fallback Markup</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={0} max={100} step={0.1} value={globalMarkup} onChange={(e) => setGlobalMarkup(Number(e.target.value))}
                    style={{ width: 100, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, textAlign: 'right' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>pips</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Applied to all symbols without a custom override</div>
              </div>

              <div style={{ borderLeft: '1px solid var(--border-primary)', paddingLeft: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Margin Call</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={0} max={500} step={1} value={marginCall} onChange={(e) => setMarginCall(Number(e.target.value))}
                    style={{ width: 90, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, textAlign: 'right' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>%</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Alert trigger level</div>
              </div>

              <div style={{ borderLeft: '1px solid var(--border-primary)', paddingLeft: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Stopout Level</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={0} max={200} step={1} value={stopout} onChange={(e) => setStopout(Number(e.target.value))}
                    style={{ width: 90, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, textAlign: 'right' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>%</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Liquidation trigger level</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Live · {mounted ? new Date(liveTs).toLocaleTimeString() : '...'}</span>
                </div>
                <button onClick={handleSaveSpread} disabled={spreadSaving || !selectedBrokerId}
                  style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: spreadSaving ? 'not-allowed' : 'pointer', opacity: spreadSaving ? 0.7 : 1 }}>
                  {spreadSaving ? 'Saving...' : 'Save Spread Config'}
                </button>
              </div>
            </div>

            {spreadMsg && (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: spreadMsg.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${spreadMsg.type === 'ok' ? '#22c55e' : '#ef4444'}`, color: spreadMsg.type === 'ok' ? '#22c55e' : '#ef4444', fontSize: 13, marginBottom: 16 }}>
                {spreadMsg.text}
              </div>
            )}

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, overflow: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 90px 120px 120px 100px 160px 130px 130px 90px', padding: '12px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', minWidth: 1200 }}>
                {['Symbol', 'Cat', 'Raw Bid', 'Raw Ask', 'Raw Spread', 'LP Markup (pips)', 'Final Bid', 'Final Ask', 'Override'].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
                ))}
              </div>

              {(!spreadConfig || spreadConfig.symbols.length === 0) && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  {!selectedBrokerId ? 'Select a broker to view spread data' : 'No active trading symbols found'}
                </div>
              )}

              {spreadConfig?.symbols.map((sym, idx) => {
                const markup = getSymbolMarkup(sym)
                const { bid, ask } = computeFinalBidAsk(sym.rawBid, sym.rawAsk, markup, sym.digits, sym.symbolName)
                const hasOverride = symbolOverrides.has(sym.symbolName)
                const isLive = sym.rawBid !== null
                return (
                  <div key={sym.symbolId} style={{ display: 'grid', gridTemplateColumns: '120px 90px 120px 120px 100px 160px 130px 130px 90px', padding: '10px 16px', borderBottom: idx < (spreadConfig.symbols.length - 1) ? '1px solid var(--border-primary)' : 'none', alignItems: 'center', background: hasOverride ? 'rgba(139,92,246,0.03)' : 'transparent', minWidth: 1200 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{sym.symbolName}</div>
                    <div>
                      <span style={{ padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: sym.category === 'FOREX' ? 'rgba(59,130,246,0.15)' : sym.category === 'CRYPTO' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)', color: sym.category === 'FOREX' ? '#3b82f6' : sym.category === 'CRYPTO' ? '#f59e0b' : '#22c55e' }}>
                        {sym.category?.slice(0, 3)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: isLive ? 'var(--text-primary)' : 'var(--text-muted)' }}>{sym.rawBid ?? '—'}</div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: isLive ? 'var(--text-primary)' : 'var(--text-muted)' }}>{sym.rawAsk ?? '—'}</div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: isLive ? '#f59e0b' : 'var(--text-muted)' }}>{sym.rawSpread ?? '—'}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="number" min={0} max={100} step={0.1} value={markup} onChange={(e) => setSymbolOverride(sym.symbolName, Number(e.target.value))}
                          style={{ width: 72, padding: '5px 8px', borderRadius: 6, border: `1px solid ${hasOverride ? 'var(--accent-primary)' : 'var(--border-primary)'}`, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, textAlign: 'right' }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>pips</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: isLive ? '#22c55e' : 'var(--text-muted)', fontWeight: 600 }}>{bid}</div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: isLive ? '#ef4444' : 'var(--text-muted)', fontWeight: 600 }}>{ask}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {hasOverride ? (
                        <>
                          <span style={{ padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>Custom</span>
                          <button onClick={() => clearSymbolOverride(sym.symbolName)} title="Reset to global" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Global</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
              {[
                { color: '#22c55e', label: 'Final Bid — markup-applied, sent to CRM' },
                { color: '#ef4444', label: 'Final Ask — markup-applied, sent to CRM' },
                { color: '#f59e0b', label: 'Raw Spread — actual MT5 spread BEFORE markup' },
                { color: '#8b5cf6', label: 'Custom = per-symbol override' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CHARGES TAB */}
        {activeTab === 'charges' && (
          <div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '24px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>LP Commission Per Lot</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20, color: 'var(--text-muted)' }}>$</span>
                    <input type="number" min={0} max={1000} step={0.5} value={commissionRate} onChange={(e) => setCommissionRate(Number(e.target.value))}
                      style={{ width: 110, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, textAlign: 'right' }} />
                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>per standard lot</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    Proportional: 0.5 lots × ${commissionRate} = ${fmt(commissionRate * 0.5)}
                  </div>
                </div>

                <div style={{ borderLeft: '1px solid var(--border-primary)', height: 60, alignSelf: 'center' }} />

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Monthly Free-Lot Threshold</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="number" min={0} max={100000} step={10} value={freeLotsThreshold} onChange={(e) => setFreeLotsThreshold(Number(e.target.value))}
                      style={{ width: 120, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, textAlign: 'right' }} />
                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>lots / month</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    First {freeLotsThreshold} lots in a month are commission-free. 0 = no threshold.
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleSaveCharges} disabled={chargesSaving || !selectedBrokerId}
                  style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: chargesSaving ? 'not-allowed' : 'pointer', opacity: chargesSaving ? 0.7 : 1 }}>
                  {chargesSaving ? 'Saving...' : 'Save Commission Settings'}
                </button>
              </div>
            </div>

            {chargesMsg && (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: chargesMsg.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${chargesMsg.type === 'ok' ? '#22c55e' : '#ef4444'}`, color: chargesMsg.type === 'ok' ? '#22c55e' : '#ef4444', fontSize: 13, marginBottom: 16 }}>
                {chargesMsg.text}
              </div>
            )}

            {chargesData && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                {[
                  { label: 'Total LP Revenue', value: `$${fmt(chargesData.totalLpRevenue)}`, sub: 'All-time commission earned', color: '#22c55e' },
                  { label: 'Total Lots Traded', value: fmt(chargesData.totalLots, 2), sub: 'All-time filled volume', color: '#3b82f6' },
                  { label: 'Total Orders', value: chargesData.totalOrders.toLocaleString(), sub: 'Filled orders', color: '#8b5cf6' },
                ].map((card) => (
                  <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{card.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: card.color, marginBottom: 4 }}>{card.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{card.sub}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-primary)' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Monthly LP Revenue Breakdown</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Shows free tier usage and actual commission charged per month</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1.2fr 1.2fr 1.2fr 1.5fr', padding: '10px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
                {['Month', 'Total Lots', 'Free Lots', 'Charged Lots', 'LP Commission Earned'].map((h) => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
                ))}
              </div>
              {(!chargesData || mergedMonthlyRows.length === 0) && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No commission data yet for this broker</div>
              )}
              {mergedMonthlyRows.map((row, idx) => (
                <div key={row.month} style={{ display: 'grid', gridTemplateColumns: '120px 1.2fr 1.2fr 1.2fr 1.5fr', padding: '12px 20px', borderBottom: idx < (mergedMonthlyRows.length - 1) ? '1px solid var(--border-primary)' : 'none', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{row.month}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmt(row.totalLots, 2)}</div>
                  <div style={{ fontSize: 13, color: row.freeLots > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                    {row.freeLots > 0 ? `${fmt(row.freeLots, 2)} lots` : '—'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmt(row.chargedLots, 2)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>${fmt(row.commission)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
