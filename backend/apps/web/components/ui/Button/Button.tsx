import React from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export type ButtonSize    = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant
  size?:     ButtonSize
  loading?:  boolean
  icon?:     React.ReactNode
  iconRight?: React.ReactNode
  fullWidth?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      fullWidth = false,
      children,
      disabled,
      className = '',
      ...props
    },
    ref,
  ) => {
    const classes = [
      styles.btn,
      styles[variant],
      styles[size],
      fullWidth ? styles.fullWidth : '',
      loading ? styles.loading : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && <span className={styles.spinner} aria-hidden="true" />}
        {!loading && icon && <span className={styles.iconLeft} aria-hidden="true">{icon}</span>}
        {children && <span className={styles.label}>{children}</span>}
        {!loading && iconRight && <span className={styles.iconRight} aria-hidden="true">{iconRight}</span>}
      </button>
    )
  },
)

Button.displayName = 'Button'
