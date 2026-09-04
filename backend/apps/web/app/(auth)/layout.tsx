'use client'

import React, { useEffect, type ReactNode } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import styles from './layout.module.css'

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 10.5A6 6 0 015.5 2.5a6 6 0 108 8z" />
    </svg>
  )
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  return (
    <div className={styles.layout}>
      {/* Background Video */}
      <video
        className={styles.bgVideo}
        src="/bg.mp4"
        autoPlay
        loop
        muted
        playsInline
      />
      <div className={styles.videoOverlay}></div>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
