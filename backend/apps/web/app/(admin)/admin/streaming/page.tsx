'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

type SourceType = 'default' | 'deriv' | 'metaapi' | 'infoway'

interface StreamingConfig {
  'streaming:source': string
  'streaming:deriv:appId': string
  'streaming:metaapi:token': string
  'streaming:infoway:apiUrl': string
  'streaming:infoway:apiKey': string
}

interface TickData {
  symbol: string
  bid: string
  ask: string
  mid: string
  direction: 'up' | 'down' | null
}

async function fetchStreamingConfig(): Promise<StreamingConfig> {
  const res = await fetch('/api/admin/streaming/config', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load streaming config')
  const body = await res.json()
  return body.config
}

async function saveStreamingConfig(payload: any) {
  const res = await fetch('/api/admin/streaming/config', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Failed to save config')
  }
  return res.json()
}

async function testStreamingConnection(source: string, config: any) {
  const res = await fetch('/api/admin/streaming/test-connection', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, config }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Connection test failed')
  }
  return res.json()
}

async function fetchPrices(): Promise<Record<string, { bid: string; ask: string; mid: string }>> {
  const res = await fetch('/api/symbols/prices', { credentials: 'include' })
  if (!res.ok) return {}
  return res.json()
}

const PROVIDERS = [
  {
    id: 'default' as SourceType,
    name: 'Default Simulator',
    badge: 'Built-In',
    color: '#6366f1',
    description: 'Binance (crypto) + Yahoo Finance (metals) + Open Exchange Rates (forex) with micro-tick simulation.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    id: 'deriv' as SourceType,
    name: 'Deriv',
    badge: 'Free WebSocket',
    color: '#ff444f',
    description: 'Live WebSocket feed from Deriv. Free to use — just enter your App ID (default: 1089). Supports forex, metals, and crypto.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/>
        <path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/>
      </svg>
    ),
  },
  {
    id: 'metaapi' as SourceType,
    name: 'MetaAPI',
    badge: 'MT5 Bridge',
    color: '#10b981',
    description: 'Stream real MT5 prices via MetaAPI REST. Enter your master token to poll quotes from connected accounts.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.07 4.93a10 10 0 010 14.14M16.24 7.76a6 6 0 010 8.49M4.93 19.07a10 10 0 010-14.14M7.76 16.24a6 6 0 010-8.49"/>
      </svg>
    ),
  },
  {
    id: 'infoway' as SourceType,
    name: 'Infoway',
    badge: 'Custom REST API',
    color: '#f59e0b',
    description: 'Connect to any REST price feed API. Enter the API endpoint URL and optional API key.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      </svg>
    ),
  },
]

function TickRow({ symbol, bid, ask, direction }: { symbol: string; bid: string; ask: string; direction: 'up' | 'down' | null }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '100px 1fr 1fr 28px',
      alignItems: 'center',
      padding: '8px 14px',
      borderBottom: '1px solid var(--card-border)',
      background: direction === 'up' ? 'rgba(16,185,129,0.035)' : direction === 'down' ? 'rgba(239,68,68,0.035)' : 'transparent',
      transition: 'background 0.3s',
    }}>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12, letterSpacing: '0.03em' }}>{symbol}</span>
      <span style={{ fontFamily: 'monospace', color: '#10b981', fontSize: 12 }}>{bid}</span>
      <span style={{ fontFamily: 'monospace', color: '#ef4444', fontSize: 12 }}>{ask}</span>
      <span style={{ textAlign: 'center', fontSize: 11, color: direction === 'up' ? '#10b981' : direction === 'down' ? '#ef4444' : 'var(--text-muted)' }}>
        {direction === 'up' ? '▲' : direction === 'down' ? '▼' : '–'}
      </span>
    </div>
  )
}

export default function AdminStreamingPage() {
  const qc = useQueryClient()
  const { data: rawConfig, isLoading } = useQuery({ queryKey: ['admin', 'streaming', 'config'], queryFn: fetchStreamingConfig })
  const { data: pricesData } = useQuery({ queryKey: ['admin', 'prices-streaming'], queryFn: fetchPrices, refetchInterval: 2000 })

  const [source, setSource] = useState<SourceType>('default')
  const [derivAppId, setDerivAppId] = useState('1089')
  const [metaapiToken, setMetaapiToken] = useState('')
  const [infowayApiUrl, setInfowayApiUrl] = useState('')
  const [infowayApiKey, setInfowayApiKey] = useState('')

  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const prevPricesRef = useRef<Record<string, string>>({})
  const [ticks, setTicks] = useState<TickData[]>([])

  useEffect(() => {
    if (!rawConfig) return
    setSource((rawConfig['streaming:source'] as SourceType) || 'default')
    setDerivAppId(rawConfig['streaming:deriv:appId'] || '1089')
    setMetaapiToken(rawConfig['streaming:metaapi:token'] || '')
    setInfowayApiUrl(rawConfig['streaming:infoway:apiUrl'] || '')
    setInfowayApiKey(rawConfig['streaming:infoway:apiKey'] || '')
  }, [rawConfig])

  useEffect(() => {
    if (!pricesData) return
    const newTicks: TickData[] = Object.entries(pricesData).map(([symbol, prices]) => {
      const prevBid = prevPricesRef.current[symbol]
      const direction: 'up' | 'down' | null =
        prevBid == null ? null :
        parseFloat(prices.bid) > parseFloat(prevBid) ? 'up' :
        parseFloat(prices.bid) < parseFloat(prevBid) ? 'down' : null
      return { symbol, ...prices, direction }
    })
    newTicks.sort((a, b) => a.symbol.localeCompare(b.symbol))
    setTicks(newTicks)
    const next: Record<string, string> = {}
    for (const [sym, p] of Object.entries(pricesData)) next[sym] = p.bid
    prevPricesRef.current = next
  }, [pricesData])

  const saveMutation = useMutation({
    mutationFn: saveStreamingConfig,
    onSuccess: () => {
      setSuccessMsg('Streaming configuration saved and applied successfully!')
      setErrorMsg('')
      qc.invalidateQueries({ queryKey: ['admin', 'streaming', 'config'] })
      setTimeout(() => setSuccessMsg(''), 5000)
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to save configuration')
      setTimeout(() => setErrorMsg(''), 6000)
    },
  })

  const handleSave = () => {
    saveMutation.mutate({
      source,
      derivAppId: source === 'deriv' ? derivAppId : undefined,
      metaapiToken: source === 'metaapi' ? metaapiToken : undefined,
      infowayApiUrl: source === 'infoway' ? infowayApiUrl : undefined,
      infowayApiKey: source === 'infoway' ? infowayApiKey : undefined,
    })
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestStatus(null)
    try {
      const cfg: any = {}
      if (source === 'deriv') cfg.appId = derivAppId
      if (source === 'metaapi') cfg.token = metaapiToken
      if (source === 'infoway') { cfg.apiUrl = infowayApiUrl; cfg.apiKey = infowayApiKey }
      const result = await testStreamingConnection(source, cfg)
      setTestStatus(result)
    } catch (err: any) {
      setTestStatus({ success: false, message: err.message })
    } finally {
      setIsTesting(false)
    }
  }

  const upCount = ticks.filter(t => t.direction === 'up').length
  const downCount = ticks.filter(t => t.direction === 'down').length

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className={s.spinner} />
      </div>
    )
  }

  const activeProv = PROVIDERS.find(p => p.id === source)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
          Data Streaming
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
          Configure the live price feed source. Changes apply immediately without downtime.
        </p>
      </div>

      {successMsg && (
        <div style={{ marginBottom: 20, padding: '12px 18px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontWeight: 600, fontSize: 14 }}>
          ✓ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ marginBottom: 20, padding: '12px 18px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontWeight: 600, fontSize: 14 }}>
          ✗ {errorMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Provider cards */}
          <div className={s.card} style={{ padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
              Select Price Feed Source
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {PROVIDERS.map(prov => (
                <button
                  key={prov.id}
                  id={`provider-${prov.id}`}
                  onClick={() => { setSource(prov.id); setTestStatus(null) }}
                  style={{
                    padding: '16px',
                    borderRadius: 12,
                    border: source === prov.id ? `2px solid ${prov.color}` : '2px solid var(--card-border)',
                    background: source === prov.id ? `${prov.color}12` : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    position: 'relative',
                    boxShadow: source === prov.id ? `0 0 20px ${prov.color}25` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                    <span style={{ color: prov.color }}>{prov.icon}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{prov.name}</span>
                  </div>
                  <span style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                    padding: '2px 7px', borderRadius: 4, background: `${prov.color}20`, color: prov.color, marginBottom: 8,
                  }}>
                    {prov.badge}
                  </span>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{prov.description}</div>
                  {source === prov.id && (
                    <div style={{
                      position: 'absolute', top: 12, right: 12,
                      width: 8, height: 8, borderRadius: '50%',
                      background: prov.color, boxShadow: `0 0 8px ${prov.color}`,
                    }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Config fields */}
          {source !== 'default' && (
            <div className={s.card} style={{ padding: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                {source === 'deriv' ? 'Deriv Configuration' : source === 'metaapi' ? 'MetaAPI Configuration' : 'Infoway API Configuration'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {source === 'deriv' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                      App ID <span style={{ color: '#6366f1', fontWeight: 400 }}>(default 1089 for free tier)</span>
                    </label>
                    <input id="deriv-app-id" type="text" value={derivAppId} onChange={e => setDerivAppId(e.target.value)} placeholder="1089" className={s.input} style={{ width: '100%', maxWidth: 280 }} />
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                      Register at <a href="https://developers.deriv.com" target="_blank" rel="noreferrer" style={{ color: '#ff444f' }}>developers.deriv.com</a> for a higher-limit App ID.
                    </p>
                  </div>
                )}
                {source === 'metaapi' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>MetaAPI Master Token</label>
                    <input id="metaapi-token" type="password" value={metaapiToken} onChange={e => setMetaapiToken(e.target.value)} placeholder="Enter MetaAPI master token…" className={s.input} style={{ width: '100%' }} />
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                      Get token at <a href="https://app.metaapi.cloud/api-access/generator" target="_blank" rel="noreferrer" style={{ color: '#10b981' }}>app.metaapi.cloud</a>.
                    </p>
                  </div>
                )}
                {source === 'infoway' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                        API URL <span style={{ color: '#ef4444', fontSize: 10 }}>*required</span>
                      </label>
                      <input id="infoway-api-url" type="url" value={infowayApiUrl} onChange={e => setInfowayApiUrl(e.target.value)} placeholder="https://api.yourprovider.com/v1/prices" className={s.input} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                        API Key <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>(optional)</span>
                      </label>
                      <input id="infoway-api-key" type="password" value={infowayApiKey} onChange={e => setInfowayApiKey(e.target.value)} placeholder="Enter API key if required…" className={s.input} style={{ width: '100%' }} />
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Expected response format: array of{' '}
                      <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>{'{ symbol, bid, ask }'}</code> or{' '}
                      <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>{'{ symbol, price }'}</code>
                    </p>
                  </>
                )}
              </div>

              {testStatus && (
                <div style={{
                  marginTop: 16, padding: '12px 16px', borderRadius: 10,
                  background: testStatus.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${testStatus.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  color: testStatus.success ? '#10b981' : '#ef4444',
                  fontSize: 13, fontWeight: 600,
                }}>
                  {testStatus.success ? '✓' : '✗'} {testStatus.message}
                  {testStatus.latencyMs != null && (
                    <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.7 }}>({testStatus.latencyMs}ms)</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {source !== 'default' && (
              <button id="test-connection-btn" onClick={handleTestConnection} disabled={isTesting} className={s.btnOutline} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isTesting ? <><div className={s.spinner} style={{ width: 14, height: 14, borderWidth: 2 }} /> Testing…</> : <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.9 19.79 19.79 0 01.01 1.18 2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14z"/>
                  </svg>
                  Test Connection</>}
              </button>
            )}
            <button id="save-streaming-config-btn" onClick={handleSave} disabled={saveMutation.isPending} className={s.btnPrimary} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {saveMutation.isPending ? <><div className={s.spinner} style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving…</> : <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                </svg>
                Save & Apply</>}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Active source:{' '}
              <strong style={{ color: activeProv?.color }}>{activeProv?.name}</strong>
            </span>
          </div>
        </div>

        {/* Right: Live ticks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Symbols', value: ticks.length, color: '#6366f1' },
              { label: 'Up / Down', value: `${upCount} / ${downCount}`, color: upCount >= downCount ? '#10b981' : '#ef4444' },
            ].map(stat => (
              <div key={stat.label} className={s.card} style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: stat.color, fontFamily: 'monospace' }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div className={s.card} style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Live Price Ticks</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>2s refresh</span>
            </div>

            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 28px', padding: '7px 14px', borderBottom: '1px solid var(--card-border)' }}>
              {['Symbol', 'Bid', 'Ask', ''].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>

            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {ticks.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No ticks received yet. Prices update every 2s.
                </div>
              ) : (
                ticks.map(t => (
                  <TickRow key={t.symbol} symbol={t.symbol} bid={t.bid} ask={t.ask} direction={t.direction} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
