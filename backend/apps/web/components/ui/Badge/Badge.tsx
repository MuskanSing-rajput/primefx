import React from 'react'
import styles from './Badge.module.css'

export type BadgeVariant =
  | 'active'
  | 'pending'
  | 'suspended'
  | 'rejected'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'accent'
  | 'info'

export interface BadgeProps {
  variant?: BadgeVariant
  dot?: boolean
  children: React.ReactNode
  className?: string
}

// Map semantic status names to variant colors
const STATUS_MAP: Record<string, BadgeVariant> = {
  APPROVED: 'active',
  ACTIVE:   'active',
  OPEN:     'success',
  FILLED:   'success',
  PENDING:  'pending',
  SUSPENDED:'warning',
  REJECTED: 'danger',
  CANCELLED:'danger',
  CLOSED:   'neutral',
}

export function Badge({ variant = 'neutral', dot = false, children, className = '' }: BadgeProps) {
  const cls = [styles.badge, styles[variant], dot ? styles.dotVariant : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={cls}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Convenience: auto-resolve variant from status string */
export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_MAP[status.toUpperCase()] ?? 'neutral'
  return <Badge variant={variant} dot>{status}</Badge>
}
