'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/providers/ThemeProvider'
import { useConnectionStatus } from '@/providers/SocketProvider'
import styles from './TopBar.module.css'

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { theme, toggleTheme } = useTheme()
  const wsStatus = useConnectionStatus()
  const pathname = usePathname()

  // Build breadcrumb from path
  const segments = pathname.split('/').filter(Boolean)

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (e) {
      console.error(e)
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <header className={styles.topbar} role="banner">
      {/* Menu toggle */}
      <button
        className={styles.menuBtn}
        onClick={onMenuClick}
        aria-label="Toggle navigation menu"
      >
        <MenuIcon />
      </button>



      {/* Spacer */}
      <div className={styles.spacer} />

      {/* Right actions */}
      <div className={styles.actions}>
        {/* WebSocket connection status */}
        <div
          className={`${styles.wsStatus} ${styles[wsStatus]}`}
          title={`Real-time: ${wsStatus}`}
          aria-label={`Connection status: ${wsStatus}`}
        >
          <span className={styles.wsDot} />
          <span className={styles.wsLabel}>{wsStatus}</span>
        </div>

        {/* Theme toggle */}
        <button
          className={styles.iconBtn}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Notifications */}
        <button className={styles.iconBtn} aria-label="Notifications">
          <BellIcon />
        </button>

        {/* Logout */}
        <button
          className={styles.iconBtn}
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out of PrimeFX"
          style={{ color: 'var(--status-danger, #ef4444)' }}
        >
          <LogOutIcon />
        </button>
      </div>
    </header>
  )
}

/* ─── Inline SVG Icons ───────────────────────────────────────── */
function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M3 5h12M3 9h12M3 13h12" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 10.5A6 6 0 015.5 2.5a6 6 0 108 8z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1.5a4.5 4.5 0 00-4.5 4.5v1.5L2 9.5v1h12v-1L12.5 7.5V6A4.5 4.5 0 008 1.5z" />
      <path d="M6.5 11.5a1.5 1.5 0 003 0" />
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11.5L14.5 8 11 4.5M14.5 8H5.5" />
    </svg>
  )
}
