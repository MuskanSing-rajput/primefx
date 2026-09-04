'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@/components/data/DataTable/DataTable'
import type { AuditLog } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchAuditLogs(): Promise<{ data: AuditLog[] }> {
  const res = await fetch('/api/admin/audit-logs', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch audit logs')
  const body = await res.json() as { data: { data: AuditLog[] } }
  return body.data
}

export default function AdminAuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-logs'],
    queryFn: fetchAuditLogs,
  })

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <div className={s.breadcrumb}>
          <span className={s.breadcrumbItem}>PrimeFX</span>
          <span className={s.breadcrumbSep}>›</span>
          <span className={s.breadcrumbItem}>Admin</span>
          <span className={s.breadcrumbSep}>›</span>
          <span className={`${s.breadcrumbItem} ${s.breadcrumbItemActive}`}>Audit Trail</span>
        </div>
      </div>

      <div className={s.tableCard}>
        <DataTable<AuditLog>
          columns={[
            { key: 'createdAt', header: 'Timestamp', width: '160px', mono: true, render: (v) => <span suppressHydrationWarning>{new Date(String(v)).toLocaleString()}</span> },
            { key: 'entityType', header: 'Entity', width: '120px' },
            { key: 'action', header: 'Action', width: '160px', mono: true },
            { key: 'performedByRole', header: 'Role', width: '110px' },
            { key: 'ipAddress', header: 'IP Address', width: '130px', mono: true },
          ]}
          data={data?.data ?? []}
          loading={isLoading}
        />
      </div>
    </div>
  )
}
