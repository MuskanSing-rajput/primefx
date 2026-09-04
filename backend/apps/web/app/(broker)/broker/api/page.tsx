'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchApiCredentials(): Promise<any[]> {
  const res = await fetch('/api/brokers/api-credentials', { credentials: 'include' })
  if (!res.ok) return []
  const body = await res.json()
  // Handle all possible envelope shapes from the TransformInterceptor
  // Shape 1: { success, data: [...] }  (direct backend response)
  // Shape 2: { success, data: { data: [...], meta } }  (paginated)
  // Shape 3: [...]  (raw array — unlikely but safe)
  const unwrapped = body?.data ?? body
  const arr = Array.isArray(unwrapped)
    ? unwrapped
    : Array.isArray(unwrapped?.data)
      ? unwrapped.data
      : []
  return arr
}

async function generateApiCredentials(): Promise<any> {
  const res = await fetch('/api/brokers/api-credentials/generate', {
    method: 'POST',
    credentials: 'include',
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message ?? 'Failed to generate')
  return body?.data ?? body
}

async function revokeApiCredential(id: string): Promise<void> {
  await fetch(`/api/brokers/api-credentials/${id}/revoke`, {
    method: 'DELETE',
    credentials: 'include',
  })
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

interface EndpointDoc {
  method: HttpMethod
  path: string
  description: string
  requestBody?: string
  responseBody: string
  curl: string
}

const BASE_URL = 'https://primeliquidfx.com/api/v1'

const ENDPOINTS: EndpointDoc[] = [
  {
    method: 'GET', path: '/ext/ping',
    description: 'Verify API key validity and retrieve broker status, permissions, and wallet summary.',
    responseBody: `{
  "success": true,
  "data": {
    "message": "API key is valid",
    "broker": {
      "id": "d1ed8765-...",
      "name": "Alpha Capital Ltd",
      "permissions": ["trade", "read"],
      "wallet": {
        "availableCreditUSD": "37500.00",
        "totalCreditUSD": "50000.00",
        "usedCreditUSD": "12500.00"
      }
    },
    "timestamp": "2026-08-04T09:00:00.000Z"
  }
}`,
    curl: `curl ${BASE_URL}/ext/ping \\
  -H "x-api-key: lp_live_YOUR_API_KEY"`,
  },
  {
    method: 'GET', path: '/ext/symbols',
    description: 'List all active trading instruments available to this broker with spread, contract size, and session info.',
    responseBody: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "EURUSD",
      "displayName": "EUR/USD",
      "category": "FOREX",
      "digits": 5,
      "contractSize": "100000",
      "minVolume": "0.01",
      "maxVolume": "100",
      "rawSpread": "0.00010",
      "isActive": true
    }
  ]
}`,
    curl: `curl ${BASE_URL}/ext/symbols \\
  -H "x-api-key: lp_live_YOUR_API_KEY"`,
  },
  {
    method: 'POST', path: '/ext/clients',
    description: 'Register a new client trading account under this broker. Map externalClientId to your CRM/MT5 account ID.',
    requestBody: `{
  "externalClientId": "MT5_221095",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@broker.com",
  "accountType": "standard",
  "leverage": 100,
  "currency": "USD"
}`,
    responseBody: `{
  "success": true,
  "data": {
    "id": "client-uuid",
    "externalClientId": "MT5_221095",
    "isActive": true,
    "brokerId": "broker-uuid"
  }
}`,
    curl: `curl -X POST ${BASE_URL}/ext/clients \\
  -H "x-api-key: lp_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"externalClientId":"MT5_221095","firstName":"John","lastName":"Doe","email":"john@broker.com","accountType":"standard","leverage":100,"currency":"USD"}'`,
  },
  {
    method: 'GET', path: '/ext/clients',
    description: 'Paginated list of all clients registered under this broker account.',
    responseBody: `{
  "success": true,
  "data": {
    "data": [
      { "id": "uuid", "externalClientId": "MT5_221095",
        "firstName": "John", "lastName": "Doe",
        "isActive": true, "leverage": 100 }
    ],
    "meta": { "total": 42, "page": 1, "limit": 20 }
  }
}`,
    curl: `curl "${BASE_URL}/ext/clients?page=1&limit=20" \\
  -H "x-api-key: lp_live_YOUR_API_KEY"`,
  },
  {
    method: 'POST', path: '/ext/orders',
    description: 'Submit an A-Book order directly using symbol name & lot size (executes under broker master account without client creation) or specify clientId/symbolId.',
    requestBody: `{
  "symbol": "XAUUSD",
  "side": "BUY",
  "type": "MARKET",
  "volume": "0.50",
  "externalId": "PT-10423",
  "stopLoss": "2640.00",
  "takeProfit": "2680.00"
}`,
    responseBody: `{
  "success": true,
  "data": {
    "order": {
      "id": "order-uuid",
      "status": "FILLED",
      "executionPrice": "2654.50",
      "filledVolume": "0.50"
    },
    "position": {
      "id": "pos-uuid",
      "status": "OPEN",
      "openPrice": "2654.50"
    }
  }
}`,
    curl: `curl -X POST ${BASE_URL}/ext/orders \\
  -H "x-api-key: lp_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"symbol":"XAUUSD","side":"BUY","type":"MARKET","volume":"0.50","externalId":"PT-10423"}'`,
  },
  {
    method: 'GET', path: '/ext/orders',
    description: 'Paginated order history for this broker. Includes all filled, cancelled, and rejected orders.',
    responseBody: `{
  "success": true,
  "data": {
    "data": [
      {
        "id": "order-uuid",
        "side": "BUY",
        "type": "MARKET",
        "status": "FILLED",
        "executionPrice": "1.08435",
        "filledVolume": "1.00",
        "createdAt": "2026-08-04T08:00:00.000Z"
      }
    ],
    "meta": { "total": 245, "page": 1, "limit": 20, "totalPages": 13 }
  }
}`,
    curl: `curl "${BASE_URL}/ext/orders?page=1&limit=20" \\
  -H "x-api-key: lp_live_YOUR_API_KEY"`,
  },
  {
    method: 'GET', path: '/ext/positions',
    description: 'List all open or closed positions. Use ?status=OPEN or ?status=CLOSED to filter.',
    responseBody: `{
  "success": true,
  "data": [
    {
      "id": "pos-uuid",
      "side": "BUY",
      "volume": "1.00",
      "openPrice": "1.08432",
      "currentPrice": "1.08510",
      "floatingPnl": "78.00",
      "status": "OPEN",
      "symbol": { "name": "EURUSD" },
      "client": { "firstName": "John", "lastName": "Doe" }
    }
  ]
}`,
    curl: `curl "${BASE_URL}/ext/positions?status=OPEN" \\
  -H "x-api-key: lp_live_YOUR_API_KEY"`,
  },
  {
    method: 'DELETE', path: '/ext/positions/:id',
    description: 'Close an open position at current market price. Returns final realized PnL.',
    responseBody: `{
  "success": true,
  "data": {
    "id": "pos-uuid",
    "status": "CLOSED",
    "closedPnl": "78.00",
    "closedAt": "2026-08-04T09:15:00.000Z"
  }
}`,
    curl: `curl -X DELETE ${BASE_URL}/ext/positions/pos-uuid \\
  -H "x-api-key: lp_live_YOUR_API_KEY"`,
  },
  {
    method: 'GET', path: '/ext/wallet',
    description: 'Get real-time wallet balance, credit limit, used credit, and available trading credit.',
    responseBody: `{
  "success": true,
  "data": {
    "availableCreditUSD": "37500.00",
    "totalCreditUSD": "50000.00",
    "usedCreditUSD": "12500.00"
  }
}`,
    curl: `curl ${BASE_URL}/ext/wallet \\
  -H "x-api-key: lp_live_YOUR_API_KEY"`,
  },
]

const METHOD_CHIP: Record<HttpMethod, string> = {
  GET:    'color:#2dd4bf;background:rgba(45,212,191,0.12);border:1px solid rgba(45,212,191,0.25)',
  POST:   'color:#22c55e;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25)',
  PUT:    'color:#fbbf24;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.25)',
  DELETE: 'color:#f87171;background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.25)',
  PATCH:  'color:#e879f9;background:rgba(232,121,249,0.12);border:1px solid rgba(232,121,249,0.25)',
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button onClick={copy} style={{
      height: 24, padding: '0 10px', borderRadius: 6, border: '1px solid var(--card-border)',
      background: 'var(--item-hover)', fontSize: 10, fontWeight: 700,
      color: copied ? '#10b981' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
      transition: 'color 150ms', flexShrink: 0,
    }}>
      {copied ? 'COPIED!' : 'COPY'}
    </button>
  )
}

const WS_EVENTS = [
  {
    event: 'price_update',
    direction: 'Server → Client',
    description: 'Real-time price tick for subscribed symbols (emitted ~800ms)',
    payload: `{
  "symbol": "EURUSD",
  "bid": "1.08430",
  "ask": "1.08440",
  "spread": "0.00010",
  "timestamp": 1722765600000
}`,
  },
  {
    event: 'subscribe_prices',
    direction: 'Client → Server',
    description: 'Subscribe to price updates for one or more symbols',
    payload: `["EURUSD", "GBPUSD", "BTCUSD"]`,
  },
  {
    event: 'position_update',
    direction: 'Server → Client',
    description: 'Floating PnL update for your broker room (broker:id)',
    payload: `{
  "positionId": "pos-uuid",
  "floatingPnl": "78.00",
  "currentPrice": "1.08510",
  "timestamp": 1722765600000
}`,
  },
]

async function fetchAlgoConnect(): Promise<any> {
  const res = await fetch('/api/brokers/algo-connect', { credentials: 'include' })
  if (!res.ok) return { connected: false, credential: null, houseClient: null }
  const body = await res.json()
  return body?.data ?? body
}

async function generateAlgoConnect(): Promise<any> {
  const res = await fetch('/api/brokers/algo-connect/generate', {
    method: 'POST',
    credentials: 'include',
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message ?? 'Failed to generate Algo Connect key')
  return body?.data ?? body
}

export default function BrokerApiPage() {
  const [activeEndpoint, setActiveEndpoint] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'rest' | 'ws' | 'algo'>('rest')
  const queryClient = useQueryClient()

  // Fetch existing credentials
  const { data: credentials = [], isLoading: loadingCreds } = useQuery({
    queryKey: ['broker', 'api-credentials'],
    queryFn: fetchApiCredentials,
  })

  // Fetch algo connect status
  const { data: algoData, isLoading: loadingAlgo } = useQuery({
    queryKey: ['broker', 'algo-connect'],
    queryFn: fetchAlgoConnect,
  })

  // One-time reveal state for newly generated credentials
  const [newCreds, setNewCreds] = useState<{ apiKey: string; apiSecret: string } | null>(null)
  // Store the last generated key locally so it persists after modal close
  const [localKey, setLocalKey] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  // Algo Connect state
  const [algoNewCreds, setAlgoNewCreds] = useState<{ apiKey: string; apiSecret: string; algoClientId: string } | null>(null)
  const [algoAcknowledged, setAlgoAcknowledged] = useState(false)
  const [algoShowSecret, setAlgoShowSecret] = useState(false)
  const [algoShowKey, setAlgoShowKey] = useState(false)
  const [algoGenerating, setAlgoGenerating] = useState(false)

  // Ensure credentials is always a proper array regardless of query state
  const credList: any[] = Array.isArray(credentials) ? credentials : []
  const activeCredential = credList.find((c: any) => c.isActive) ?? null
  // The key to display — prefer DB-loaded active credential, fall back to locally stored key
  const displayKey = activeCredential?.apiKey ?? localKey

  const handleGenerate = async () => {
    if (displayKey && !confirm('This will revoke the existing API key. Any integrations using it will stop working. Continue?')) return
    setGenerating(true)
    try {
      const result = await generateApiCredentials()
      setNewCreds({ apiKey: result.apiKey, apiSecret: result.apiSecret })
      setLocalKey(result.apiKey)
      setAcknowledged(false)
      setShowSecret(false)
      setShowKey(false)
      queryClient.invalidateQueries({ queryKey: ['broker', 'api-credentials'] })
    } catch (e: any) {
      alert(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Delete this API key? Any integrations using it will stop working immediately.')) return
    setRevoking(id)
    try {
      await revokeApiCredential(id)
      setLocalKey(null)
      setShowKey(false)
      queryClient.invalidateQueries({ queryKey: ['broker', 'api-credentials'] })
      queryClient.invalidateQueries({ queryKey: ['broker', 'algo-connect'] })
    } finally {
      setRevoking(null)
    }
  }

  const handleAlgoGenerate = async () => {
    setAlgoGenerating(true)
    try {
      const result = await generateAlgoConnect()
      setAlgoNewCreds({ apiKey: result.apiKey, apiSecret: result.apiSecret, algoClientId: result.algoClientId })
      setAlgoAcknowledged(false)
      setAlgoShowSecret(false)
      setAlgoShowKey(false)
      queryClient.invalidateQueries({ queryKey: ['broker', 'algo-connect'] })
      queryClient.invalidateQueries({ queryKey: ['broker', 'api-credentials'] })
    } catch (e: any) {
      alert(e.message)
    } finally {
      setAlgoGenerating(false)
    }
  }

  return (
    <>


      {/* ─── Credentials card ─── */}
      <div className={s.card} style={{ marginBottom: 16 }}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>API Credentials</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {displayKey ? (
              <span className={`${s.chip} ${s.chipGreen}`}><span className={s.chipDot}/>Active</span>
            ) : (
              <span className={`${s.chip} ${s.chipRed}`}><span className={s.chipDot}/>No Active Key</span>
            )}
          </div>
        </div>
        <div className={s.cardBody}>

          {/* ─── Step 1: One-time Secret Reveal (shown immediately after generation) ─── */}
          {newCreds && (
            <div style={{
              marginBottom: 20, padding: 20, borderRadius: 12,
              background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>New API Credentials Generated — Save Your Secret Now</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Your API Secret will <strong style={{ color: '#f59e0b' }}>never be shown again</strong> after you close this panel.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {/* API Key */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                    🔑 API Key
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={s.apiKeyBox} style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {showKey ? newCreds.apiKey : newCreds.apiKey.substring(0, 12) + '•'.repeat(16) + newCreds.apiKey.slice(-4)}
                    </div>
                    <button onClick={() => setShowKey(v => !v)} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--item-hover)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {showKey ? 'HIDE' : 'SHOW'}
                    </button>
                    <CopyBtn text={newCreds.apiKey} />
                  </div>
                </div>
                {/* API Secret */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#f59e0b', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                    🔒 API Secret <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(shown once only)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={s.apiKeyBox} style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', borderColor: 'rgba(245,158,11,0.3)' }}>
                      {showSecret ? newCreds.apiSecret : '•'.repeat(40)}
                    </div>
                    <button onClick={() => setShowSecret(v => !v)} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', fontSize: 10, fontWeight: 700, color: '#f59e0b', cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {showSecret ? 'HIDE' : 'REVEAL'}
                    </button>
                    <CopyBtn text={newCreds.apiSecret} />
                  </div>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  I have copied and securely stored my API Secret. I understand it cannot be recovered.
                </span>
              </label>
              <button
                disabled={!acknowledged}
                onClick={() => setNewCreds(null)}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: '1px solid var(--card-border)',
                  background: acknowledged ? 'rgba(245,158,11,0.15)' : 'var(--item-hover)',
                  color: acknowledged ? '#f59e0b' : 'var(--text-disabled)',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  cursor: acknowledged ? 'pointer' : 'not-allowed',
                  transition: 'all 150ms',
                }}
              >
                ✓ Done — Close this panel
              </button>
            </div>
          )}

          {/* ─── Main Credentials Display ─── */}
          {displayKey ? (
            /* Key exists — show it with Regenerate + Delete actions */
            <div style={{ marginBottom: newCreds ? 0 : 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text-accent)', flexShrink: 0,
                }}>1</div>
                <div className={s.fieldLabel} style={{ margin: 0 }}>API Key <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(x-api-key header)</span></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className={s.apiKeyBox} style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' }}>
                  {showKey ? displayKey : displayKey.substring(0, 16) + '•'.repeat(20) + displayKey.slice(-4)}
                </div>
                <button
                  onClick={() => setShowKey(v => !v)}
                  title={showKey ? 'Hide key' : 'Show full key'}
                  style={{ height: 32, padding: '0 12px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--item-hover)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}
                >
                  {showKey ? 'HIDE' : 'SHOW'}
                </button>
                <CopyBtn text={displayKey} />

                {/* Delete: deactivates the key without generating a new one */}
                {activeCredential && (
                  <button
                    onClick={() => handleRevoke(activeCredential.id)}
                    disabled={revoking === activeCredential.id}
                    title="Permanently delete this API key"
                    style={{
                      height: 32, padding: '0 14px', borderRadius: 6,
                      border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)',
                      fontSize: 10, fontWeight: 700, color: '#ef4444',
                      cursor: revoking === activeCredential.id ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                      transition: 'all 150ms',
                    }}
                  >
                    {revoking === activeCredential.id ? '⏳…' : '🗑 Delete'}
                  </button>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Created: {activeCredential ? new Date(activeCredential.createdAt).toLocaleString() : 'just now'}
                {activeCredential?.lastUsedAt && (
                  <> &nbsp;·&nbsp; Last used: {new Date(activeCredential.lastUsedAt).toLocaleString()}</>
                )}
              </div>
            </div>
          ) : (
            /* No key — show empty state + Generate button */
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', borderRadius: 10, background: 'var(--item-hover)', border: '1px dashed var(--card-border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>No API key generated yet</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click Generate to create your API Key + Secret pair. The secret will be shown once.</div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-accent)',
                  background: 'rgba(59,130,246,0.09)', color: 'var(--text-accent)',
                  fontSize: 12, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                  transition: 'all 150ms', opacity: generating ? 0.7 : 1, flexShrink: 0,
                }}
              >
                {generating ? '⏳ Generating…' : '+ Generate API Key'}
              </button>
            </div>
          )}

          <div className={s.divider}/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <div className={s.fieldLabel} style={{ marginBottom: 8 }}>Base URL</div>
              <div className={s.apiKeyBox}>{BASE_URL}</div>
            </div>
            <div>
              <div className={s.fieldLabel} style={{ marginBottom: 8 }}>Authentication</div>
              <div className={s.apiKeyBox} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>Header: x-api-key: lp_live_...</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              { label: 'Auth Method', value: 'x-api-key', icon: '🔑' },
              { label: 'Rate Limit', value: '1,000 req/min', icon: '⚡' },
              { label: 'Format', value: 'JSON / REST', icon: '📡' },
              { label: 'WebSocket', value: 'Socket.IO v4', icon: '🔌' },
            ].map(item => (
              <div key={item.label} style={{ padding: '12px 14px', background: 'var(--item-hover)', borderRadius: 8, border: '1px solid var(--card-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{item.icon} {item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Tab Navigation ─── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, padding: '4px', background: 'var(--item-hover)', border: '1px solid var(--card-border)', borderRadius: 10, width: 'fit-content' }}>
        {(['rest', 'ws', 'algo'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: activeTab === tab ? 'var(--btn-active-bg)' : 'transparent',
              color: activeTab === tab ? 'var(--btn-active-color)' : 'var(--text-muted)',
              transition: 'all 150ms',
            }}
          >
            {tab === 'rest' ? '🔗 REST API' : tab === 'ws' ? '🔌 WebSocket' : '🤖 Algo Connect'}
          </button>
        ))}
      </div>

      {/* ─── Algo Connect Panel ─── */}
      {activeTab === 'algo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>



          {/* Algo API Credentials Card */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>
                Algo Connect API Key
                <span style={{ marginLeft: 10, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(168,85,247,0.12)', color: '#a855f7', fontFamily: 'var(--font-mono)' }}>ALGO ONLY</span>
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {algoData?.connected ? (
                  <span className={`${s.chip} ${s.chipGreen}`}><span className={s.chipDot}/>Connected</span>
                ) : (
                  <span className={`${s.chip} ${s.chipRed}`}><span className={s.chipDot}/>Not Connected</span>
                )}
              </div>
            </div>
            <div className={s.cardBody}>

              {/* One-time reveal after generate */}
              {algoNewCreds && (
                <div style={{ marginBottom: 20, padding: 20, borderRadius: 12, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <span style={{ fontSize: 20 }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#a855f7' }}>New Algo Connect Credentials — Save Now</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Your Algo Secret will <strong style={{ color: '#a855f7' }}>never be shown again</strong> after you close this panel.</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>🔑 Algo API Key</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={s.apiKeyBox} style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                          {algoShowKey ? algoNewCreds.apiKey : algoNewCreds.apiKey.substring(0, 12) + '•'.repeat(16) + algoNewCreds.apiKey.slice(-4)}
                        </div>
                        <button onClick={() => setAlgoShowKey(v => !v)} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--item-hover)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          {algoShowKey ? 'HIDE' : 'SHOW'}
                        </button>
                        <CopyBtn text={algoNewCreds.apiKey} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a855f7', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>🔒 Algo Secret <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(shown once only)</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={s.apiKeyBox} style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', borderColor: 'rgba(168,85,247,0.3)' }}>
                          {algoShowSecret ? algoNewCreds.apiSecret : '•'.repeat(40)}
                        </div>
                        <button onClick={() => setAlgoShowSecret(v => !v)} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.1)', fontSize: 10, fontWeight: 700, color: '#a855f7', cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          {algoShowSecret ? 'HIDE' : 'REVEAL'}
                        </button>
                        <CopyBtn text={algoNewCreds.apiSecret} />
                      </div>
                    </div>
                  </div>
                  {/* House Client ID */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>🏦 Algo House Client ID <span style={{ fontWeight: 400 }}>(paste this in Algo LP Connect)</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className={s.apiKeyBox} style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>
                        {algoNewCreds.algoClientId}
                      </div>
                      <CopyBtn text={algoNewCreds.algoClientId} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
                    <input type="checkbox" checked={algoAcknowledged} onChange={e => setAlgoAcknowledged(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>I have copied the API Key, Secret, and Client ID to Algo LP Connect settings.</span>
                  </label>
                  <button
                    disabled={!algoAcknowledged}
                    onClick={() => setAlgoNewCreds(null)}
                    style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--card-border)', background: algoAcknowledged ? 'rgba(168,85,247,0.15)' : 'var(--item-hover)', color: algoAcknowledged ? '#a855f7' : 'var(--text-disabled)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: algoAcknowledged ? 'pointer' : 'not-allowed', transition: 'all 150ms' }}
                  >
                    ✓ Done — Close this panel
                  </button>
                </div>
              )}

              {/* Existing algo key display */}
              {!algoNewCreds && algoData?.connected && algoData?.credential && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                    Active since {new Date(algoData.credential.createdAt).toLocaleString()}
                    {algoData.credential.lastUsedAt && <> · Last used: {new Date(algoData.credential.lastUsedAt).toLocaleString()}</>}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>🔑 Algo API Key (masked)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className={s.apiKeyBox} style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {algoData.credential.apiKey.substring(0, 12) + '•'.repeat(20) + algoData.credential.apiKey.slice(-4)}
                      </div>
                      <CopyBtn text={algoData.credential.apiKey} />
                      <button
                        onClick={() => handleRevoke(algoData.credential.id)}
                        disabled={revoking === algoData.credential.id}
                        title="Permanently delete this Algo Connect API key"
                        style={{
                          height: 32, padding: '0 14px', borderRadius: 6,
                          border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)',
                          fontSize: 10, fontWeight: 700, color: '#ef4444',
                          cursor: revoking === algoData.credential.id ? 'not-allowed' : 'pointer',
                          fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                          transition: 'all 150ms',
                        }}
                      >
                        {revoking === algoData.credential.id ? '⏳…' : '🗑 Delete'}
                      </button>
                    </div>
                  </div>
                  {algoData.houseClient && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>🏦 Algo House Client ID</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={s.apiKeyBox} style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>
                          {algoData.houseClient.id}
                        </div>
                        <CopyBtn text={algoData.houseClient.id} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* No key yet empty state */}
              {!algoNewCreds && !algoData?.connected && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', borderRadius: 10, background: 'var(--item-hover)', border: '1px dashed var(--card-border)', marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>No Algo Connect key yet</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click Generate to create a dedicated Algo API Key for Algo Platform. A house account will be auto-created.</div>
                  </div>
                </div>
              )}

              {!algoNewCreds && !algoData?.connected && (
                <button
                  onClick={handleAlgoGenerate}
                  disabled={algoGenerating}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.09)', color: '#a855f7', fontSize: 12, fontWeight: 700, cursor: algoGenerating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', transition: 'all 150ms', opacity: algoGenerating ? 0.7 : 1 }}
                >
                  {algoGenerating ? '⏳ Generating…' : '+ Generate Algo Connect Key'}
                </button>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ─── REST Endpoints ─── */}
      {activeTab === 'rest' && (
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}>REST Endpoints <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>(Auth: x-api-key header)</span></span>
            <span className={`${s.chip} ${s.chipNeutral}`}>{ENDPOINTS.length} endpoints</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ENDPOINTS.map((ep, i) => (
              <div key={i} style={{ borderBottom: i < ENDPOINTS.length - 1 ? '1px solid var(--card-border)' : 'none' }}>
                {/* Row */}
                <button
                  onClick={() => setActiveEndpoint(activeEndpoint === i ? null : i)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left', transition: 'background 150ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--item-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{
                    padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 800,
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', flexShrink: 0,
                    ...Object.fromEntries(METHOD_CHIP[ep.method].split(';').map(s => s.split(':').map(x => x.trim()) as [string,string])),
                  }}>{ep.method}</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', flexShrink: 0 }}>{ep.path}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{ep.description}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2.5} style={{ transform: activeEndpoint === i ? 'rotate(180deg)' : 'none', transition: 'transform 180ms', flexShrink: 0 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {/* Expanded detail */}
                {activeEndpoint === i && (
                  <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: ep.requestBody ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12 }}>
                    {ep.requestBody && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Request Body</span>
                          <CopyBtn text={ep.requestBody}/>
                        </div>
                        <pre style={{ margin: 0, background: 'var(--item-hover)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '12px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', lineHeight: 1.7, overflow: 'auto' }}>{ep.requestBody}</pre>
                      </div>
                    )}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Response</span>
                        <CopyBtn text={ep.responseBody}/>
                      </div>
                      <pre style={{ margin: 0, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 8, padding: '12px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-success)', lineHeight: 1.7, overflow: 'auto' }}>{ep.responseBody}</pre>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>cURL</span>
                        <CopyBtn text={ep.curl}/>
                      </div>
                      <pre style={{ margin: 0, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: 8, padding: '12px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', lineHeight: 1.7, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{ep.curl}</pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── WebSocket Docs ─── */}
      {activeTab === 'ws' && (
        <div className={s.card}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}>WebSocket Integration <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>(Socket.IO v4 — API Key Auth)</span></span>
          </div>
          <div className={s.cardBody}>
            {/* Connection */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                Connection
              </div>
              <div style={{ position: 'relative' }}>
                <pre style={{ margin: 0, background: 'var(--item-hover)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '16px 18px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
{`// Node.js / Browser — Socket.IO Client
import { io } from "socket.io-client";

const socket = io("https://primeliquidfx.com/prices", {
  query: { apiKey: "lp_live_YOUR_API_KEY" },
  // OR via header:
  extraHeaders: { "x-api-key": "lp_live_YOUR_API_KEY" },
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 2000,
});

socket.on("connect", () => {
  console.log("Connected to LP price feed:", socket.id);
  // Subscribe to symbols
  socket.emit("subscribe_prices", ["EURUSD", "GBPUSD", "XAUUSD", "BTCUSD"]);
});

socket.on("disconnect", () => {
  console.log("Disconnected. Auto-reconnecting...");
});`}
                </pre>
                <div style={{ position: 'absolute', top: 10, right: 12 }}>
                  <CopyBtn text={`import { io } from "socket.io-client";\n\nconst socket = io("https://primeliquidfx.com/prices", {\n  query: { apiKey: "lp_live_YOUR_API_KEY" },\n  transports: ["websocket"],\n  reconnection: true,\n});\n\nsocket.on("connect", () => {\n  socket.emit("subscribe_prices", ["EURUSD", "GBPUSD"]);\n});`}/>
                </div>
              </div>
            </div>

            <div className={s.divider}/>

            {/* Events */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
              Events
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {WS_EVENTS.map((ev, i) => (
                <div key={i} style={{ background: 'var(--item-hover)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <code style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', background: 'rgba(59,130,246,0.1)', padding: '3px 8px', borderRadius: 5 }}>
                      {ev.event}
                    </code>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: ev.direction.startsWith('Server') ? 'rgba(34,197,94,0.1)' : 'rgba(251,191,36,0.1)',
                      color: ev.direction.startsWith('Server') ? '#10b981' : '#f59e0b',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {ev.direction}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{ev.description}</div>
                  <pre style={{ margin: 0, background: 'var(--item-hover)', border: '1px solid var(--card-border)', borderRadius: 6, padding: '10px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{ev.payload}</pre>
                </div>
              ))}
            </div>

            <div className={s.divider}/>

            {/* Price listener snippet */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                Full Price Listener Example
              </div>
              <pre style={{ margin: 0, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: 8, padding: '16px 18px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', lineHeight: 1.8, overflow: 'auto' }}>
{`socket.on("price_update", (tick) => {
  console.log(tick.symbol, "BID:", tick.bid, "ASK:", tick.ask);
  // → EURUSD BID: 1.08430 ASK: 1.08440
  updateYourPricingUI(tick);
});

socket.on("position_update", (update) => {
  const { positionId, floatingPnl, currentPrice } = update;
  updatePositionInYourCRM(positionId, floatingPnl);
});

// Clean disconnect
process.on("SIGTERM", () => socket.disconnect());`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
