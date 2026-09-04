'use client'

import React, { createContext, useCallback, useContext, useReducer } from 'react'
import styles from './ToastProvider.module.css'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  duration?: number
}

type Action =
  | { type: 'ADD'; toast: Toast }
  | { type: 'REMOVE'; id: string }

function reducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case 'ADD':
      return [...state, action.toast].slice(-5) // Max 5 toasts
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id)
    default:
      return state
  }
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, [])

  const toast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    const duration = opts.duration ?? 4000
    dispatch({ type: 'ADD', toast: { ...opts, id, duration } })
    setTimeout(() => dispatch({ type: 'REMOVE', id }), duration)
  }, [])

  const success = useCallback((title: string, description?: string) => toast({ type: 'success', title, ...(description ? { description } : {}) }), [toast])
  const error   = useCallback((title: string, description?: string) => toast({ type: 'error',   title, ...(description ? { description } : {}), duration: 6000 }), [toast])
  const warning = useCallback((title: string, description?: string) => toast({ type: 'warning', title, ...(description ? { description } : {}) }), [toast])
  const info    = useCallback((title: string, description?: string) => toast({ type: 'info',    title, ...(description ? { description } : {}) }), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <div className={styles.container} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            toast={t}
            onClose={() => dispatch({ type: 'REMOVE', id: t.id })}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const icons: Record<ToastType, string> = {
    success: '✓',
    error:   '✕',
    warning: '!',
    info:    'i',
  }

  return (
    <div className={`${styles.toast} ${styles[toast.type]}`} role="alert">
      <div className={styles.toastIcon}>{icons[toast.type]}</div>
      <div className={styles.toastBody}>
        <p className={styles.toastTitle}>{toast.title}</p>
        {toast.description && (
          <p className={styles.toastDesc}>{toast.description}</p>
        )}
      </div>
      <button
        className={styles.toastClose}
        onClick={onClose}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
      <div
        className={styles.toastProgress}
        style={{ animationDuration: `${toast.duration ?? 4000}ms` }}
      />
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
