'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { API_BASE, API_ROUTES } from '@lp/constants'
import styles from './BrokerNav.module.css'

// ── SVG Icons ──────────────────────────────────────────────────────────
const Icons = {
  Logo: () => (
    <img src="/logo_prime.png" alt="PrimeFX Logo" style={{ width: 52, height: 52, objectFit: 'contain', display: 'block' }} />
  ),
  Dashboard: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Clients: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  Positions: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  Orders: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  Wallet: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V6H4a2 2 0 000 4h14v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6" /><circle cx="18" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  Pricing: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
    </svg>
  ),
  API: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  Reports: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Bell: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),
  Settings: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  Logout: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Sun: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" /><path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" /><path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
  ),
  Moon: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  ),
  Support: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  ChevDown: () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', href: '/broker/dashboard', Icon: Icons.Dashboard },
  { id: 'clients', label: 'Clients', href: '/broker/clients', Icon: Icons.Clients },
  { id: 'positions', label: 'Positions', href: '/broker/positions', Icon: Icons.Positions },
  { id: 'orders', label: 'Orders', href: '/broker/orders', Icon: Icons.Orders },
  { id: 'wallet', label: 'Wallet', href: '/broker/wallet', Icon: Icons.Wallet },
  { id: 'api', label: 'API', href: '/broker/api', Icon: Icons.API },
  { id: 'reports', label: 'Reports', href: '/broker/reports', Icon: Icons.Reports },
  { id: 'support', label: 'Support', href: '/broker/support', Icon: Icons.Support },
]

interface BrokerNavProps {
  userLabel?: string
  userRole?: string
  children: React.ReactNode
}

export function BrokerNav({ userLabel = 'Broker', userRole = 'BROKER', children }: BrokerNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [dropOpen, setDropOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [connected] = useState(true)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [isImpersonating, setIsImpersonating] = useState(false)

  useEffect(() => {
    const cookies = document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=')
      if (k && v !== undefined) acc[k] = v
      return acc
    }, {} as Record<string, string>)
    setIsImpersonating(cookies['is_impersonating'] === 'true')
  }, [])

  const dropRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const IDLE_TIMEOUT = 20 * 60 * 1000 // 20 minutes
  const REFRESH_INTERVAL = 5 * 60 * 1000 // refresh token every 5 minutes of activity

  // Initialize theme
  useEffect(() => {
    const saved = localStorage.getItem('broker-theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    } else {
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('broker-theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  // ── Idle session management ─────────────────────────────────────────────
  const doLogout = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }) } catch { }
    router.push('/login')
  }, [router])

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      if (res.status === 401) doLogout()
    } catch { }
  }, [doLogout])

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(doLogout, IDLE_TIMEOUT)
  }, [doLogout, IDLE_TIMEOUT])

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
    const handler = () => resetIdleTimer()
    events.forEach(ev => window.addEventListener(ev, handler, { passive: true }))
    resetIdleTimer()

    // Refresh token every 5 min while active
    refreshTimer.current = setInterval(refreshSession, REFRESH_INTERVAL)

    return () => {
      events.forEach(ev => window.removeEventListener(ev, handler))
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [resetIdleTimer, refreshSession, REFRESH_INTERVAL])

  // Close dropdowns on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}${API_ROUTES.AUTH.LOGOUT}`, { method: 'POST', credentials: 'include' })
    } catch { }
    router.push('/login')
  }

  const handleExitImpersonation = async () => {
    try {
      const res = await fetch('/api/auth/exit-impersonate', {
        method: 'POST',
      })
      if (!res.ok) {
        throw new Error('Failed to exit impersonation')
      }
      router.push('/admin/brokers')
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const { data: brokerProfile } = useQuery({
    queryKey: ['broker', 'nav-profile'],
    queryFn: async () => {
      const res = await fetch('/api/brokers/me', { credentials: 'include' })
      if (!res.ok) return null
      const body = await res.json()
      return body?.data ?? body
    },
    staleTime: 60000,
  })

  // ── Notifications ───────────────────────────────────────────────────────
  const { data: rawNotifications } = useQuery<Array<{ id: string; type: string; title: string; message: string; createdAt: string; read: boolean }>>({
    queryKey: ['broker', 'notifications'],
    queryFn: async () => {
      const res = await fetch(`/api/brokers/notifications?_=${Date.now()}`, { credentials: 'include' })
      if (!res.ok) return []
      const body = await res.json()
      return body?.data ?? []
    },
    refetchInterval: 5000,
    staleTime: 4000,
  })
  const [lastReadNotifsAt, setLastReadNotifsAt] = useState<string | null>(null)

  useEffect(() => {
    let saved = localStorage.getItem('last_read_notifs_at')
    if (!saved) {
      saved = new Date().toISOString()
      localStorage.setItem('last_read_notifs_at', saved)
    }
    setLastReadNotifsAt(saved)
  }, [])

  const rawNotifs = Array.isArray(rawNotifications) ? rawNotifications : []
  const notifications = rawNotifs.map((n) => {
    if (n.type === 'SUPPORT') {
      return n
    }
    const isRead = lastReadNotifsAt ? new Date(n.createdAt) <= new Date(lastReadNotifsAt) : false
    return {
      ...n,
      read: isRead,
    }
  })
  const unreadCount = notifications.filter(n => !n.read).length

  const displayName = brokerProfile?.companyName || userLabel || 'Broker'
  const initials = (displayName || 'Broker').split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()


  return (
    <div className={styles.shell}>
      {/* Sleek Left Sidebar */}
      <aside className={styles.sidebar}>
        {/* Logo brand icon */}
        <Link href="/broker/dashboard" className={styles.sidebarLogo} aria-label="Logo">
          <div 
            className={styles.logoTile}
            style={theme === 'light' ? {
              background: '#000000',
              borderRadius: '50%',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 54,
              height: 54,
            } : undefined}
          >
            <img 
              src="/logo_prime.png" 
              alt="PrimeFX Logo" 
              style={{ 
                width: theme === 'light' ? 44 : 52, 
                height: theme === 'light' ? 44 : 52, 
                objectFit: 'contain', 
                display: 'block' 
              }} 
            />
          </div>
        </Link>

        {/* Navigation links stack */}
        <div className={styles.sidebarLinks}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                aria-label={item.label}
                style={{ position: 'relative' }}
              >
                <item.Icon />
                {item.id === 'support' && notifications.some(n => n.type === 'SUPPORT' && !n.read) && (
                  <span className={styles.notifDot} style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: '#ef4444',
                    border: '2px solid var(--sidebar-bg)',
                    boxShadow: '0 0 6px #ef4444',
                  }} />
                )}
                <span className={styles.tooltip}>{item.label}</span>
              </Link>
            )
          })}
        </div>

        {/* Bottom links stack */}
        <div className={styles.sidebarBottom}>
          <button
            className={styles.navLink}
            onClick={() =>
              router.push(
                userRole?.toLowerCase().includes('admin') ? '/admin/settings' : '/broker/settings'
              )
            }
            aria-label="Settings"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Icons.Settings />
            <span className={styles.tooltip}>Settings</span>
          </button>
          <button
            className={`${styles.navLink} ${styles.dropdownDanger}`}
            onClick={handleLogout}
            aria-label="Sign Out"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Icons.Logout />
            <span className={styles.tooltip}>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Top Header */}
      <header className={styles.navbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {NAV_ITEMS.find((n) => pathname.startsWith(n.href))?.label || 'Platform'}
          </div>
          {isImpersonating && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#ef4444',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 600,
            }}>
              <span>⚠️ Impersonating Broker</span>
              <button
                onClick={handleExitImpersonation}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#dc2626'}
                onMouseOut={(e) => e.currentTarget.style.background = '#ef4444'}
              >
                Exit
              </button>
            </div>
          )}
        </div>

        <div className={styles.navRight}>
          {/* Connection status */}
          <div className={`${styles.statusPill} ${!connected ? styles.statusPillDisconnected : ''}`}>
            <span className={`${styles.statusDot} ${!connected ? styles.statusDotDisconnected : ''}`} />
            {connected ? 'Live' : 'Disconnected'}
          </div>

          {/* Theme Toggle */}
          <button className={styles.iconBtn} onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
          </button>

          {/* Notifications */}
          <div ref={notifRef} style={{ position: 'relative' }}>
            <button
              className={styles.iconBtn}
              aria-label="Notifications"
              onClick={() => {
                setNotifOpen((o) => {
                  const next = !o
                  if (next) {
                    const nowStr = new Date().toISOString()
                    localStorage.setItem('last_read_notifs_at', nowStr)
                    setLastReadNotifsAt(nowStr)
                  }
                  return next
                })
              }}
            >
              <Icons.Bell />
              {unreadCount > 0 && (
                <span className={styles.notifDot} style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ef4444',
                  border: '2px solid var(--surface-primary)',
                }} />
              )}
            </button>

            {notifOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 320,
                background: 'var(--dropdown-bg, #13141c)',
                border: '1px solid var(--card-border)',
                borderRadius: 12,
                boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 15px rgba(99,102,241,0.05)',
                zIndex: 1000,
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid rgba(99,102,241,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(99,102,241,0.06)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🔔</div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: 0.2 }}>Notifications</span>
                  </div>
                  {unreadCount > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 800,
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      color: '#fff', borderRadius: 20, padding: '3px 9px', letterSpacing: 0.4,
                    }}>
                      {unreadCount} NEW
                    </span>
                  )}
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: 14,
                        background: 'rgba(99,102,241,0.1)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, margin: '0 auto 12px',
                      }}>✓</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>All caught up!</div>
                      <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)', lineHeight: 1.5 }}>No new notifications right now</div>
                    </div>
                  ) : notifications.map((n) => (
                    <div key={n.id} style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: n.read ? 'transparent' : 'rgba(99,102,241,0.05)',
                      cursor: 'default',
                      transition: 'background 0.15s',
                    }}>
                      {!n.read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', marginBottom: 6 }} />}
                      <div style={{ fontSize: 12, fontWeight: 700, color: n.read ? 'rgba(148,163,184,0.7)' : '#e2e8f0', marginBottom: 3 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)', lineHeight: 1.5 }}>{n.message}</div>
                      <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)', marginTop: 5 }}>{new Date(n.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Avatar / dropdown */}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button className={styles.avatarBtn} onClick={() => setDropOpen((d) => !d)}>
              <div className={styles.avatar}>{initials}</div>
              <div>
                <div className={styles.avatarLabel}>{displayName}</div>
              </div>
              <Icons.ChevDown />
            </button>

            {dropOpen && (
              <div className={styles.avatarDropdown}>
                <button
                  className={styles.dropdownItem}
                  onClick={() => {
                    setDropOpen(false)
                    router.push(
                      userRole?.toLowerCase().includes('admin')
                        ? '/admin/settings'
                        : '/broker/settings'
                    )
                  }}
                >
                  <Icons.Settings /> Settings
                </button>
                <div className={styles.dropdownDivider} />
                <button
                  className={`${styles.dropdownItem} ${styles.dropdownDanger}`}
                  onClick={handleLogout}
                >
                  <Icons.Logout /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className={styles.pageContent}>
        {children}
      </main>
    </div>
  )
}
