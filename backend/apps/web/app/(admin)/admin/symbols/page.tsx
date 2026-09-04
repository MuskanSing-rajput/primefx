'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@/components/data/DataTable/DataTable'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge/Badge'
import { SlidePanel } from '@/components/layout/SlidePanel/SlidePanel'
import type { TradingSymbol } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchSymbols(): Promise<TradingSymbol[]> {
  const res = await fetch('/api/symbols?activeOnly=false', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch symbols')
  const body = await res.json() as { data: TradingSymbol[] }
  return body.data
}

export default function AdminSymbolsPage() {
  const [panelOpen, setPanelOpen] = useState(false)
  
  // Form State variables
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [category, setCategory] = useState<'FOREX' | 'CFD' | 'CRYPTO' | 'COMMODITY' | 'INDEX'>('FOREX')
  const [baseCurrency, setBaseCurrency] = useState('EUR')
  const [quoteCurrency, setQuoteCurrency] = useState('USD')
  const [digits, setDigits] = useState('5')
  const [contractSize, setContractSize] = useState('100000')
  const [minVolume, setMinVolume] = useState('0.01')
  const [maxVolume, setMaxVolume] = useState('100.00')
  const [stepVolume, setStepVolume] = useState('0.01')
  const [rawSpread, setRawSpread] = useState('0.00002')
  const [rawCommission, setRawCommission] = useState('0.00')
  const [rawSwapLong, setRawSwapLong] = useState('-5.5')
  const [rawSwapShort, setRawSwapShort] = useState('1.5')
  const [tradingSessionStart, setTradingSessionStart] = useState('00:00')
  const [tradingSessionEnd, setTradingSessionEnd] = useState('23:59')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: symbols, isLoading, refetch } = useQuery({
    queryKey: ['symbols', 'admin-list'],
    queryFn: fetchSymbols,
  })

  const handleNameChange = (val: string) => {
    const uppercased = val.toUpperCase()
    setName(uppercased)
    // Auto-derive base and quote currency for typical 6-letter FX pairs
    if (uppercased.length === 6) {
      setBaseCurrency(uppercased.slice(0, 3))
      setQuoteCurrency(uppercased.slice(3, 6))
    }
  }

  const handleClosePanel = () => {
    setPanelOpen(false)
    setName('')
    setDisplayName('')
    setCategory('FOREX')
    setBaseCurrency('EUR')
    setQuoteCurrency('USD')
    setDigits('5')
    setContractSize('100000')
    setMinVolume('0.01')
    setMaxVolume('100.00')
    setStepVolume('0.01')
    setRawSpread('0.00002')
    setRawCommission('0.00')
    setRawSwapLong('-5.5')
    setRawSwapShort('1.5')
    setTradingSessionStart('00:00')
    setTradingSessionEnd('23:59')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (name.trim().length < 3 || name.trim().length > 20) {
      alert('Symbol name must be between 3 and 20 characters')
      return
    }
    if (displayName.trim().length < 3 || displayName.trim().length > 40) {
      alert('Description must be between 3 and 40 characters')
      return
    }
    const parsedDigits = parseInt(digits, 10)
    if (isNaN(parsedDigits) || parsedDigits < 0 || parsedDigits > 8) {
      alert('Digits must be between 0 and 8')
      return
    }
    const parsedContractSize = parseFloat(contractSize)
    if (isNaN(parsedContractSize) || parsedContractSize <= 0) {
      alert('Contract Size must be positive')
      return
    }

    // RegEx validations
    const decimalRegex = /^\d+(\.\d+)?$/
    const signedDecimalRegex = /^-?\d+(\.\d+)?$/
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/

    if (!decimalRegex.test(minVolume)) { alert('Invalid Min Volume'); return }
    if (!decimalRegex.test(maxVolume)) { alert('Invalid Max Volume'); return }
    if (!decimalRegex.test(stepVolume)) { alert('Invalid Step Volume'); return }
    if (!decimalRegex.test(rawSpread)) { alert('Invalid Raw Spread'); return }
    if (!decimalRegex.test(rawCommission)) { alert('Invalid Raw Commission'); return }
    if (!signedDecimalRegex.test(rawSwapLong)) { alert('Invalid Raw Swap Long'); return }
    if (!signedDecimalRegex.test(rawSwapShort)) { alert('Invalid Raw Swap Short'); return }
    if (!timeRegex.test(tradingSessionStart)) { alert('Session Start must be in HH:MM format'); return }
    if (!timeRegex.test(tradingSessionEnd)) { alert('Session End must be in HH:MM format'); return }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim().toUpperCase(),
          displayName: displayName.trim(),
          category,
          baseCurrency: baseCurrency.trim(),
          quoteCurrency: quoteCurrency.trim(),
          digits: parsedDigits,
          contractSize: parsedContractSize,
          minVolume,
          maxVolume,
          stepVolume,
          rawSpread,
          rawCommission,
          rawSwapLong,
          rawSwapShort,
          tradingSessionStart,
          tradingSessionEnd,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message || 'Failed to add symbol')
      }

      alert('Trading symbol added successfully!')
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
    height: '36px',
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
          <span className={`${s.breadcrumbItem} ${s.breadcrumbItemActive}`}>Symbol Management</span>
        </div>
        <Button variant="primary" size="md" onClick={() => setPanelOpen(true)}>
          + Add Symbol
        </Button>
      </div>

      <div className={s.tableCard}>
        <DataTable<TradingSymbol>
          columns={[
            { key: 'name', header: 'Symbol', width: '100px', render: (v) => <span className={s.symbolName}>{String(v)}</span> },
            { key: 'displayName', header: 'Description' },
            { key: 'category', header: 'Category', width: '110px' },
            { key: 'digits', header: 'Digits', width: '80px', mono: true, align: 'center' },
            { key: 'contractSize', header: 'Contract Size', width: '130px', mono: true, align: 'right' },
            { key: 'rawSpread', header: 'Raw Spread', width: '110px', mono: true, align: 'right' },
            { key: 'rawCommission', header: 'Raw Comm', width: '110px', mono: true, align: 'right' },
            { key: 'isActive', header: 'Status', width: '100px', render: (v) => v ? <StatusBadge status="APPROVED" /> : <StatusBadge status="SUSPENDED" /> },
          ]}
          data={symbols ?? []}
          loading={isLoading}
        />
      </div>

      <SlidePanel
        open={panelOpen}
        onClose={handleClosePanel}
        title="Add Trading Symbol"
        subtitle="Provision a new Forex, Metal, Crypto, or Index pair"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingBottom: 'var(--space-6)' }}>
          
          <div style={sectionHeaderStyle}>Basic Details</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Symbol Name</label>
              <input
                type="text"
                required
                maxLength={20}
                placeholder="e.g. EURUSD"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                style={inputStyle}
              >
                <option value="FOREX">Forex</option>
                <option value="CFD">CFD</option>
                <option value="CRYPTO">Crypto</option>
                <option value="COMMODITY">Commodity</option>
                <option value="INDEX">Index</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              required
              maxLength={40}
              placeholder="e.g. Euro vs US Dollar"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={sectionHeaderStyle}>Contract Settings</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Base Currency</label>
              <input
                type="text"
                required
                maxLength={10}
                placeholder="EUR"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Quote Currency</label>
              <input
                type="text"
                required
                maxLength={10}
                placeholder="USD"
                value={quoteCurrency}
                onChange={(e) => setQuoteCurrency(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Digits (0-8)</label>
              <input
                type="number"
                required
                min={0}
                max={8}
                value={digits}
                onChange={(e) => setDigits(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Contract Size</label>
              <input
                type="number"
                required
                min={1}
                value={contractSize}
                onChange={(e) => setContractSize(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={sectionHeaderStyle}>Volume Parameters</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Min Vol</label>
              <input
                type="text"
                required
                value={minVolume}
                onChange={(e) => setMinVolume(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Max Vol</label>
              <input
                type="text"
                required
                value={maxVolume}
                onChange={(e) => setMaxVolume(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Step Vol</label>
              <input
                type="text"
                required
                value={stepVolume}
                onChange={(e) => setStepVolume(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={sectionHeaderStyle}>Spread & Swap Policies</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Raw Spread</label>
              <input
                type="text"
                required
                value={rawSpread}
                onChange={(e) => setRawSpread(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Raw Commission</label>
              <input
                type="text"
                required
                value={rawCommission}
                onChange={(e) => setRawCommission(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Swap Long</label>
              <input
                type="text"
                required
                value={rawSwapLong}
                onChange={(e) => setRawSwapLong(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Swap Short</label>
              <input
                type="text"
                required
                value={rawSwapShort}
                onChange={(e) => setRawSwapShort(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={sectionHeaderStyle}>Trading Hours</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Session Start (HH:MM)</label>
              <input
                type="text"
                required
                placeholder="00:00"
                value={tradingSessionStart}
                onChange={(e) => setTradingSessionStart(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Session End (HH:MM)</label>
              <input
                type="text"
                required
                placeholder="23:59"
                value={tradingSessionEnd}
                onChange={(e) => setTradingSessionEnd(e.target.value)}
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
              {isSubmitting ? 'Adding Symbol…' : 'Add Trading Symbol'}
            </Button>
          </div>
        </form>
      </SlidePanel>
    </div>
  )
}
