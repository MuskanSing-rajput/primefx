import React, { useEffect, useState } from 'react'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts'
import styles from './StatCard.module.css'

export interface StatCardProps {
  label: string
  value: string | number
  subtitle?: string | undefined
  trend?: {
    value: number    // Positive = up, negative = down
    suffix?: string | undefined  // e.g. "%" or "USD"
  } | undefined
  accent?: 'default' | 'success' | 'danger' | 'warning' | 'accent' | undefined
  mono?: boolean | undefined    // Use monospace font for numeric values
  loading?: boolean | undefined
  icon?: React.ReactNode | undefined
  sparklineData?: number[] | undefined
  sparklineType?: 'line' | 'bar' | undefined
  sparklineColor?: string | undefined
}

export function StatCard({
  label,
  value,
  subtitle,
  trend,
  accent = 'default',
  mono = true,
  loading = false,
  icon,
  sparklineData,
  sparklineType = 'line',
  sparklineColor,
}: StatCardProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const trendPositive = trend && trend.value > 0
  const trendNegative = trend && trend.value < 0

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={`skeleton ${styles.skeletonLabel}`} />
        <div className={`skeleton ${styles.skeletonValue}`} />
        <div className={`skeleton ${styles.skeletonSubtitle}`} />
      </div>
    )
  }

  // Generate safe element IDs for SVG gradients
  const gradientId = `grad-${label.replace(/[^a-zA-Z0-9]/g, '-')}`

  return (
    <div className={`${styles.card} ${styles[accent]}`}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      </div>

      {/* Value */}
      <div className={`${styles.value} ${mono ? 'num' : ''}`}>
        {value}
      </div>

      {/* Footer */}
      {(trend !== undefined || subtitle) && (
        <div className={styles.footer}>
          {trend !== undefined && (
            <span
              className={`${styles.trend} ${
                trendPositive ? styles.trendUp : trendNegative ? styles.trendDown : styles.trendFlat
              }`}
              aria-label={`Trend: ${trendPositive ? 'up' : trendNegative ? 'down' : 'flat'} ${Math.abs(trend.value)}${trend.suffix ?? ''}`}
            >
              {trendPositive ? '↑' : trendNegative ? '↓' : '→'}
              <span className={styles.trendValue}>
                {trendPositive ? '+' : ''}{trend.value.toFixed(2)}{trend.suffix ?? ''}
              </span>
            </span>
          )}
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </div>
      )}

      {/* Background Sparkline */}
      {mounted && sparklineData && sparklineData.length > 0 && (
        <div className={styles.sparklineContainer}>
          <ResponsiveContainer width="100%" height="100%">
            {sparklineType === 'bar' ? (
              <BarChart data={sparklineData.map((v, i) => ({ id: i, value: v }))} margin={{ top: 12, bottom: 0, left: 0, right: 0 }}>
                <Bar dataKey="value" fill={sparklineColor ?? 'var(--text-accent)'} radius={[1, 1, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={sparklineData.map((v, i) => ({ id: i, value: v }))} margin={{ top: 12, bottom: 0, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={sparklineColor ?? 'var(--text-accent)'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={sparklineColor ?? 'var(--text-accent)'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={sparklineColor ?? 'var(--text-accent)'}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={false}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
