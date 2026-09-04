'use client'

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchBrokerDetails(): Promise<any> {
  const res = await fetch('/api/brokers/me', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const body = await res.json()
  return body?.data ?? body
}

export default function BrokerSettingsPage() {
  const { data: broker, isLoading, refetch } = useQuery({ queryKey: ['broker', 'me-settings'], queryFn: fetchBrokerDetails })

  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')

  // MFA Setup states
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaSuccess, setMfaSuccess] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)

  // Notification states
  const [notifFills, setNotifFills] = useState(true)
  const [notifWallet, setNotifWallet] = useState(true)
  const [notifReports, setNotifReports] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('broker-theme') as 'dark' | 'light' | null
    if (saved) setTheme(saved)
  }, [])

  useEffect(() => {
    if (broker) {
      setContactName(broker.contactName ?? '')
      setPhone(broker.phone ?? '')
    }
  }, [broker])

  const changeTheme = (next: 'dark' | 'light') => {
    setTheme(next)
    localStorage.setItem('broker-theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileSaving(true)
    setMfaError('')
    setMfaSuccess('')
    try {
      const res = await fetch(`/api/brokers/${broker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactName, phone }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message ?? 'Failed to update')
      }
      setMfaSuccess('Broker profile updated successfully!')
      refetch()
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Error updating profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const startMfaSetup = async () => {
    setMfaError('')
    setMfaSuccess('')
    setMfaLoading(true)
    try {
      const res = await fetch('/api/brokers/mfa/generate', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to generate MFA secret')
      const body = await res.json() as any
      // API wraps in { success, data } via TransformInterceptor
      const payload = body?.data ?? body
      setMfaSetup(payload as { secret: string; otpauthUrl: string })
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Error')
    } finally {
      setMfaLoading(false)
    }
  }

  const handleEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfaSetup) return
    const cleanCode = totpCode.trim().replace(/\s+/g, '')
    if (!cleanCode) { setMfaError('Please enter the 6-digit TOTP code'); return }
    setMfaError('')
    setMfaSuccess('')
    setMfaLoading(true)
    try {
      const res = await fetch('/api/brokers/mfa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: mfaSetup.secret, totpCode: cleanCode }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message ?? 'Invalid code')
      }
      setMfaSuccess('2FA security enabled successfully!')
      setMfaSetup(null)
      setTotpCode('')
      refetch()
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Error')
    } finally {
      setMfaLoading(false)
    }
  }

  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = totpCode.trim().replace(/\s+/g, '')
    if (!cleanCode) { setMfaError('Enter a 2FA code to disable'); return }
    setMfaError('')
    setMfaSuccess('')
    setMfaLoading(true)
    try {
      const res = await fetch('/api/brokers/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode: cleanCode }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message ?? 'Invalid code')
      }
      setMfaSuccess('2FA security disabled successfully.')
      setTotpCode('')
      refetch()
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Error')
    } finally {
      setMfaLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className={s.spinner} />
      </div>
    )
  }

  return (
    <>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* LEFT COLUMN: Profile & Notification Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Profile Details Card */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>General Profile Details</span>
            </div>
            <div className={s.cardBody}>
              <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Company Name</label>
                    <input type="text" value={broker?.companyName ?? ''} disabled className={s.input} style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Email Address</label>
                    <input type="email" value={broker?.email ?? ''} disabled className={s.input} style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Contact Name</label>
                    <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} required className={s.input} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Phone Number</label>
                    <input type="text" value={phone} onChange={e => setPhone(e.target.value)} required className={s.input} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                  <button type="submit" disabled={profileSaving} className={s.btnPrimary}>
                    {profileSaving ? 'Saving Changes...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Theme Settings Card */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>Theme Settings</span>
            </div>
            <div className={s.cardBody}>
              <div style={{ display: 'flex', gap: 14 }}>
                <button
                  onClick={() => changeTheme('dark')}
                  className={theme === 'dark' ? s.btnPrimary : s.btnOutline}
                  style={{ flex: 1, padding: '16px 20px', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800 }}>🌌 Cyberpunk Dark</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Teal & magenta highlights (Default)</span>
                </button>
                <button
                  onClick={() => changeTheme('light')}
                  className={theme === 'light' ? s.btnPrimary : s.btnOutline}
                  style={{ flex: 1, padding: '16px 20px', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800 }}>☀️ Sleek Light</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Clean, high contrast theme</span>
                </button>
              </div>
            </div>
          </div>

          {/* Notifications preferences Card */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>Notification Preferences</span>
            </div>
            <div className={s.cardBody} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={notifFills} onChange={e => setNotifFills(e.target.checked)} style={{ accentColor: '#3b82f6' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Order Fills &amp; Liquidations</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Send instant alert email when client orders fill or margin calls trigger.</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={notifWallet} onChange={e => setNotifWallet(e.target.checked)} style={{ accentColor: '#3b82f6' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Deposits &amp; Withdrawals</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Receive notifications for auto-credited deposits and completed withdrawals.</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={notifReports} onChange={e => setNotifReports(e.target.checked)} style={{ accentColor: '#3b82f6' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Weekly Reports Digest</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Send a weekly PDF performance and PnL breakdown of all broker clients.</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 2FA Authentication Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className={s.card}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>Two-Step Verification (2FA)</span>
              <span className={`${s.chip} ${broker?.mfaEnabled ? s.chipGreen : s.chipRed}`}>
                {broker?.mfaEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className={s.cardBody}>
              {/* Feedback messages */}
              {mfaError && <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>{mfaError}</div>}
              {mfaSuccess && <div style={{ padding: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>{mfaSuccess}</div>}

              {broker?.mfaEnabled ? (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
                    Google Authenticator 2FA is active on your profile. Withdrawals and security configurations require a 6-digit TOTP token to execute.
                  </p>
                  <form onSubmit={handleDisableMfa} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Enter 2FA Code to Disable</label>
                      <input type="text" maxLength={6} placeholder="000000" value={totpCode} onChange={e => setTotpCode(e.target.value)} required className={s.input} style={{ letterSpacing: '0.5em', textAlign: 'center', fontSize: 18, fontWeight: 800 }} />
                    </div>
                    <button type="submit" disabled={mfaLoading} className={s.btnOutline} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                      {mfaLoading ? 'Processing...' : 'Disable 2FA'}
                    </button>
                  </form>
                </div>
              ) : mfaSetup ? (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 14 }}>
                    Scan the QR code below or enter the manual secret key in your Google Authenticator or Authy app.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', padding: 16, borderRadius: 10, width: 'fit-content', margin: '0 auto 14px auto' }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&ecc=L&data=${encodeURIComponent(mfaSetup.otpauthUrl)}`}
                      alt="2FA QR Code"
                      width={250}
                      height={250}
                      style={{ display: 'block' }}
                    />
                  </div>
                  <div style={{ background: 'var(--item-hover)', border: '1px solid var(--card-border)', padding: 10, borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Manual Secret Key — type this into your authenticator app</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#3b82f6', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', textAlign: 'center', wordBreak: 'break-all' }}>
                      {((mfaSetup.secret ?? '').match(/.{1,4}/g) ?? []).join(' ')}
                    </div>
                  </div>
                  <form onSubmit={handleEnableMfa} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Enter 6-digit Code</label>
                      <input type="text" maxLength={6} placeholder="000000" value={totpCode} onChange={e => setTotpCode(e.target.value)} required className={s.input} style={{ letterSpacing: '0.5em', textAlign: 'center', fontSize: 18, fontWeight: 800 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button type="button" onClick={() => setMfaSetup(null)} className={s.btnOutline} style={{ flex: 1 }}>Cancel</button>
                      <button type="submit" disabled={mfaLoading} className={s.btnPrimary} style={{ flex: 1 }}>
                        {mfaLoading ? 'Enabling...' : 'Verify & Enable'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
                    Protect your broker profile from unauthorized access. Enabling Two-Factor Authentication requires a unique 6-digit code from Google Authenticator to confirm crypto withdrawals.
                  </p>
                  <button onClick={startMfaSetup} disabled={mfaLoading} className={s.btnPrimary} style={{ width: '100%' }}>
                    {mfaLoading ? 'Generating Secret...' : 'Setup Two-Factor Authentication'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
