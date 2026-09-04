'use client'

import React from 'react'
import styles from './CreditGauge.module.css'

export interface CreditGaugeProps {
  available: number
  used: number
  total: number
  loading?: boolean
}

export function CreditGauge({ available, used, total, loading = false }: CreditGaugeProps) {
  const utilization = total > 0 ? (used / total) * 100 : 0
  const clampedUtil = Math.min(utilization, 100)

  const level = clampedUtil < 50 ? 'Low' : clampedUtil < 80 ? 'Mid' : 'High'

  const fillClass = level === 'Low' ? styles.gaugeFillLow
    : level === 'Mid' ? styles.gaugeFillMid
    : styles.gaugeFillHigh

  const percentClass = level === 'Low' ? styles.gaugePercentLow
    : level === 'Mid' ? styles.gaugePercentMid
    : styles.gaugePercentHigh

  if (loading) {
    return (
      <div className={styles.gaugeContainer}>
        <div className={styles.gaugeHeader}>
          <span className={styles.gaugeTitle}>Credit Utilization</span>
        </div>
        <div className={styles.gaugeTrack}>
          <div className={`skeleton`} style={{ width: '60%', height: '100%', borderRadius: '9999px' }} />
        </div>
        <div className={styles.gaugeLegend}>
          <div className={styles.legendItem}><div className="skeleton" style={{ width: '60px', height: '10px' }} /><div className="skeleton" style={{ width: '80px', height: '16px', marginTop: '4px' }} /></div>
          <div className={styles.legendItem}><div className="skeleton" style={{ width: '60px', height: '10px' }} /><div className="skeleton" style={{ width: '80px', height: '16px', marginTop: '4px' }} /></div>
          <div className={styles.legendItem}><div className="skeleton" style={{ width: '60px', height: '10px' }} /><div className="skeleton" style={{ width: '80px', height: '16px', marginTop: '4px' }} /></div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.gaugeContainer}>
      <div className={styles.gaugeHeader}>
        <span className={styles.gaugeTitle}>Credit Utilization</span>
        <span className={`${styles.gaugePercent} ${percentClass}`}>
          {clampedUtil.toFixed(1)}%
        </span>
      </div>

      <div className={styles.gaugeTrack}>
        <div
          className={`${styles.gaugeFill} ${fillClass}`}
          style={{ width: `${clampedUtil}%` }}
        />
      </div>

      {clampedUtil >= 80 && (
        <span className={styles.dangerText}>
          ⚠ High credit utilization — margin call risk
        </span>
      )}
      {clampedUtil >= 50 && clampedUtil < 80 && (
        <span className={styles.warningText}>
          ⚠ Monitor your credit usage closely
        </span>
      )}

      <div className={styles.gaugeLegend}>
        <div className={styles.legendItem}>
          <span className={styles.legendLabel}>Available</span>
          <span className={styles.legendValue}>${available.toLocaleString()}</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendLabel}>Used</span>
          <span className={styles.legendValue}>${used.toLocaleString()}</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendLabel}>Total</span>
          <span className={styles.legendValue}>${total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}
