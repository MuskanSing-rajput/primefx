'use client'

import React, { useState, useMemo, useCallback } from 'react'
import styles from './DataTable.module.css'

export interface DataTableColumn<T> {
  key: string
  header: string
  width?: string
  minWidth?: string
  sortable?: boolean
  mono?: boolean        // Monospace (for numbers)
  align?: 'left' | 'right' | 'center'
  render?: (value: unknown, row: T, index: number) => React.ReactNode
}

export interface DataTableProps<T extends { id: string }> {
  columns: DataTableColumn<T>[]
  data: T[]
  loading?: boolean
  empty?: React.ReactNode
  onRowClick?: (row: T) => void
  selectedId?: string | undefined
  pagination?: {
    total: number
    page: number
    limit: number
    onPageChange: (page: number) => void
    onLimitChange?: (limit: number) => void
  }
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: string, order: 'asc' | 'desc') => void
  stickyHeader?: boolean
  /** Render row actions in a final column */
  rowActions?: (row: T) => React.ReactNode
}

const SKELETON_ROWS = 8

export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading = false,
  empty,
  onRowClick,
  selectedId,
  pagination,
  sortBy,
  sortOrder,
  onSort,
  stickyHeader = true,
  rowActions,
}: DataTableProps<T>) {
  const [localSort, setLocalSort] = useState<{ key: string; order: 'asc' | 'desc' } | null>(null)

  const effectiveSortKey   = sortBy ?? localSort?.key
  const effectiveSortOrder = sortOrder ?? localSort?.order ?? 'asc'

  const handleSort = useCallback(
    (key: string) => {
      const newOrder =
        effectiveSortKey === key && effectiveSortOrder === 'asc' ? 'desc' : 'asc'
      if (onSort) {
        onSort(key, newOrder)
      } else {
        setLocalSort({ key, order: newOrder })
      }
    },
    [effectiveSortKey, effectiveSortOrder, onSort],
  )

  // Client-side sort (when no external sort handler)
  const sortedData = useMemo(() => {
    if (!localSort || onSort) return data
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[localSort.key]
      const bVal = (b as Record<string, unknown>)[localSort.key]
      if (aVal == null) return 1
      if (bVal == null) return -1
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
      return localSort.order === 'asc' ? cmp : -cmp
    })
  }, [data, localSort, onSort])

  const allColumns = rowActions
    ? [...columns, { key: '__actions', header: '', width: '60px', align: 'right' as const }]
    : columns

  return (
    <div className={styles.container}>
      <div className={styles.tableWrapper}>
        <table className={styles.table} aria-busy={loading}>
          {/* Header */}
          <thead className={stickyHeader ? styles.stickyHead : ''}>
            <tr className={styles.headerRow}>
              {allColumns.map((col) => (
                <th
                  key={col.key}
                  className={`${styles.th} ${col.sortable ? styles.sortable : ''} ${
                    col.align === 'right' ? styles.right : col.align === 'center' ? styles.center : ''
                  }`}
                  style={{ width: col.width, minWidth: col.minWidth }}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    col.sortable && effectiveSortKey === col.key
                      ? effectiveSortOrder === 'asc' ? 'ascending' : 'descending'
                      : col.sortable ? 'none' : undefined
                  }
                >
                  <span className={styles.thInner}>
                    {col.header}
                    {col.sortable && (
                      <span className={styles.sortIcon} aria-hidden="true">
                        {effectiveSortKey === col.key
                          ? effectiveSortOrder === 'asc' ? '↑' : '↓'
                          : '⇅'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {loading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <tr key={i} className={styles.skeletonRow}>
                  {allColumns.map((col) => (
                    <td key={col.key} className={styles.td}>
                      <div className={`skeleton ${styles.skeletonCell}`} />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={allColumns.length}>
                  {empty ?? (
                    <div className={styles.empty}>
                      <span className={styles.emptyIcon}>◻</span>
                      <span>No records found</span>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              sortedData.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className={`${styles.row} ${onRowClick ? styles.clickable : ''} ${
                    selectedId === row.id ? styles.selected : ''
                  }`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  aria-selected={selectedId === row.id}
                >
                  {columns.map((col) => {
                    const rawValue = (row as Record<string, unknown>)[col.key]
                    return (
                      <td
                        key={col.key}
                        className={`${styles.td} ${
                          col.align === 'right' ? styles.right : col.align === 'center' ? styles.center : ''
                        } ${col.mono ? 'num' : ''}`}
                      >
                        {col.render
                          ? col.render(rawValue, row, rowIndex)
                          : rawValue != null ? String(rawValue) : '—'}
                      </td>
                    )
                  })}
                  {rowActions && (
                    <td className={`${styles.td} ${styles.right}`} onClick={(e) => e.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>
            Showing{' '}
            <strong>{Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}</strong>
            {' – '}
            <strong>{Math.min(pagination.page * pagination.limit, pagination.total)}</strong>
            {' of '}
            <strong>{pagination.total.toLocaleString()}</strong>
          </span>
          <div className={styles.paginationControls}>
            <button
              className={styles.pageBtn}
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              aria-label="Previous page"
            >
              ‹
            </button>
            {buildPageNumbers(pagination.page, Math.ceil(pagination.total / pagination.limit)).map(
              (p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} className={styles.pageEllipsis}>…</span>
                ) : (
                  <button
                    key={p}
                    className={`${styles.pageBtn} ${p === pagination.page ? styles.pageBtnActive : ''}`}
                    onClick={() => pagination.onPageChange(Number(p))}
                    aria-current={p === pagination.page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                ),
            )}
            <button
              className={styles.pageBtn}
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}
