'use client'

import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './SlidePanel.module.css'

export type PanelSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

export interface SlidePanelProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  size?: PanelSize
  children: React.ReactNode
  footer?: React.ReactNode
  /** Prevent closing on backdrop click */
  disableBackdropClose?: boolean
}

export function SlidePanel({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
  disableBackdropClose = false,
}: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Trap body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Focus trap
  useEffect(() => {
    if (open && panelRef.current) {
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      focusable[0]?.focus()
    }
  }, [open])

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      className={`${styles.wrapper} ${open ? styles.open : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className={styles.backdrop}
        onClick={disableBackdropClose ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`${styles.panel} ${styles[size]}`}
        tabIndex={-1}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close panel"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Body */}
        <div className={styles.body}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <>
            <div className={styles.divider} />
            <div className={styles.footer}>
              {footer}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 4L4 12M4 4l8 8" />
    </svg>
  )
}
