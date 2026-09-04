'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@/components/data/DataTable/DataTable'
import { StatusBadge } from '@/components/ui/Badge/Badge'
import { Button } from '@/components/ui/Button'
import { SlidePanel } from '@/components/layout/SlidePanel/SlidePanel'
import type { Broker } from '@lp/shared-types'
import s from '@/components/layout/BrokerNav/BrokerNav.module.css'

async function fetchBrokers(): Promise<{ data: Broker[] }> {
  const res = await fetch('/api/brokers', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch brokers')
  const body = await res.json() as { data: { data: Broker[] } }
  return body.data
}

function FormattedDateCell({ dateString }: { dateString: string }) {
  const [formatted, setFormatted] = useState('')
  useEffect(() => {
    setFormatted(new Date(dateString).toLocaleDateString())
  }, [dateString])
  return <span>{formatted || '—'}</span>
}

export default function AdminBrokersPage() {
  const router = useRouter()
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editCompanyName, setEditCompanyName] = useState('')
  const [editContactName, setEditContactName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editCountry, setEditCountry] = useState('')
  const [editEntityType, setEditEntityType] = useState('')
  const [editRegulatoryLicense, setEditRegulatoryLicense] = useState('')
  const [editBusinessTaxId, setEditBusinessTaxId] = useState('')

  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const { data: brokers, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'brokers', 'list'],
    queryFn: fetchBrokers,
  })

  // MetaAPI Direct Connection Form State
  const [metaapiAccountId, setMetaapiAccountId] = useState('')
  const [metaapiAccessToken, setMetaapiAccessToken] = useState('')
  const [connectingMt5, setConnectingMt5] = useState(false)
  const [disconnectingMt5, setDisconnectingMt5] = useState(false)

  const [activeTab, setActiveTab] = useState<'DEMO' | 'LIVE'>('DEMO')

  // Reset form when broker selection changes
  React.useEffect(() => {
    if (selectedBroker) {
      setMetaapiAccountId('')
      setMetaapiAccessToken('')
      setActiveTab((selectedBroker as any).tradingMode || 'DEMO')
    }
  }, [selectedBroker])

  const handleConnectMt5 = async () => {
    if (!selectedBroker) return
    if (!metaapiAccountId || !metaapiAccessToken) {
      alert('Please fill in MetaAPI Account ID and Access Token')
      return
    }

    setConnectingMt5(true)
    try {
      const res = await fetch(`/api/admin/brokers/${selectedBroker.id}/connect-mt5`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: metaapiAccountId,
          token: metaapiAccessToken,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || 'Failed to connect MetaAPI account')
      }

      alert('MetaAPI Account Connected successfully!')
      
      setSelectedBroker(prev => {
        if (!prev) return null
        return {
          ...prev,
          tradingMode: 'LIVE',
          executionAccount: {
            id: metaapiAccountId,
            accountName: data.accountName || `Direct MT5 (${metaapiAccountId})`,
            provider: 'metaapi',
            accountNumber: metaapiAccountId,
            serverAddress: '',
            credentials: {
              accountId: metaapiAccountId,
              token: metaapiAccessToken,
              symbolMapping: data.mapping,
              suffix: data.suffix
            }
          } as any
        }
      })
      setActiveTab('LIVE')
      await refetch()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setConnectingMt5(false)
    }
  }

  const handleDisconnectMt5 = async () => {
    if (!selectedBroker) return
    const confirmed = confirm('Are you sure you want to disconnect MT5? This will remove the MetaAPI connection config locally.')
    if (!confirmed) return

    setDisconnectingMt5(true)
    try {
      const res = await fetch(`/api/admin/brokers/${selectedBroker.id}/disconnect-mt5`, {
        method: 'POST',
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || 'Failed to disconnect MT5')
      }

      alert('MT5 Direct Connection removed successfully.')
      setSelectedBroker(prev => {
        if (!prev) return null
        return {
          ...prev,
          tradingMode: 'DEMO',
          executionAccount: null
        }
      })
      setActiveTab('DEMO')
      await refetch()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDisconnectingMt5(false)
    }
  }

  const handleToggleMode = async (mode: 'DEMO' | 'LIVE') => {
    if (!selectedBroker) return
    if (mode === 'LIVE' && !(selectedBroker as any).executionAccount) {
      alert('Please connect a live MT5 account first')
      return
    }

    try {
      const res = await fetch(`/api/brokers/${selectedBroker.id}/trading-mode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingMode: mode }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Failed to update trading mode')
      }
      setSelectedBroker(prev => {
        if (!prev) return null
        return {
          ...prev,
          tradingMode: mode,
        } as any
      })
      await refetch()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const handleTabClick = async (mode: 'DEMO' | 'LIVE') => {
    setActiveTab(mode)
    if (selectedBroker && (selectedBroker as any).executionAccount) {
      await handleToggleMode(mode)
    }
  }

  const handleUpdateStatus = async (status: 'APPROVED' | 'SUSPENDED' | 'REJECTED') => {
    if (!selectedBroker) return
    const confirmed = confirm(`Are you sure you want to set this broker status to ${status}?`)
    if (!confirmed) return

    setIsUpdating(true)
    try {
      const res = await fetch(`/api/brokers/${selectedBroker.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, adminNote }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to update status')
      }

      // Update local state and refetch the list
      setSelectedBroker((prev) => (prev ? { ...prev, status, adminNote } : null))
      await refetch()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleStartEdit = () => {
    if (!selectedBroker) return
    setEditCompanyName(selectedBroker.companyName || '')
    setEditContactName(selectedBroker.contactName || '')
    setEditEmail(selectedBroker.email || '')
    setEditPhone(selectedBroker.phone || '')
    setEditCountry(selectedBroker.country || '')
    setEditEntityType(selectedBroker.entityType || '')
    setEditRegulatoryLicense(selectedBroker.regulatoryLicense || '')
    setEditBusinessTaxId(selectedBroker.businessTaxId || '')
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedBroker) return
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/brokers/${selectedBroker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: editCompanyName,
          contactName: editContactName,
          email: editEmail,
          phone: editPhone,
          country: editCountry,
          entityType: editEntityType,
          regulatoryLicense: editRegulatoryLicense || null,
          businessTaxId: editBusinessTaxId,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to update broker')
      }

      const responseBody = await res.json() as { success: boolean; data: Broker }
      const updated = responseBody.data
      setSelectedBroker(prev => prev ? { ...prev, ...updated } : null)
      setIsEditing(false)
      await refetch()
      alert('Broker information updated successfully!')
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDeleteBroker = async () => {
    if (!selectedBroker) return
    const confirmed = confirm(`WARNING: Are you sure you want to delete this broker (${selectedBroker.companyName})? This action is permanent and will delete all associated data (orders, positions, wallets).`)
    if (!confirmed) return

    setIsUpdating(true)
    try {
      const res = await fetch(`/api/brokers/${selectedBroker.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to delete broker')
      }

      alert('Broker deleted successfully.')
      setSelectedBroker(null)
      await refetch()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleImpersonate = async () => {
    if (!selectedBroker) return
    const confirmed = confirm(`Are you sure you want to login as ${selectedBroker.companyName}?`)
    if (!confirmed) return

    setIsUpdating(true)
    try {
      const res = await fetch(`/api/brokers/${selectedBroker.id}/impersonate`, {
        method: 'POST',
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to impersonate broker')
      }

      // Redirect to broker dashboard
      router.push('/broker/dashboard')
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className={s.page}>

      <div className={s.tableCard}>
        <DataTable<Broker>
          columns={[
            { key: 'companyName', header: 'Company Name', render: (v) => <span className={s.companyName}>{String(v)}</span> },
            { key: 'contactName', header: 'Contact Person' },
            { key: 'email', header: 'Email' },
            { key: 'country', header: 'Country', width: '100px' },
            { key: 'regulatoryLicense', header: 'License', width: '120px', render: (v) => v ? String(v) : '—' },
            { key: 'status', header: 'Status', width: '120px', render: (v) => <StatusBadge status={String(v)} /> },
            { key: 'createdAt', header: 'Registered', width: '130px', mono: true, render: (v) => <FormattedDateCell dateString={String(v)} /> },
          ]}
          data={brokers?.data ?? []}
          loading={isLoading}
          onRowClick={(row) => {
            setSelectedBroker(row)
            setAdminNote(row.adminNote || '')
          }}
        />
      </div>

      {/* Broker detail SlidePanel */}
      <SlidePanel
        open={!!selectedBroker}
        onClose={() => {
          setSelectedBroker(null)
          setIsEditing(false)
        }}
        title={selectedBroker?.companyName ?? 'Broker Detail'}
        subtitle={`ID: ${selectedBroker?.id ?? ''}`}
        footer={selectedBroker ? (
          isEditing ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                variant="primary"
                size="md"
                onClick={handleSaveEdit}
                disabled={isUpdating}
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setIsEditing(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <Button
                variant="primary"
                size="md"
                disabled={isUpdating || selectedBroker.status === 'APPROVED'}
                onClick={() => handleUpdateStatus('APPROVED')}
              >
                {isUpdating ? 'Updating...' : 'Approve Broker'}
              </Button>
              <Button
                variant="danger"
                size="md"
                disabled={isUpdating || selectedBroker.status === 'REJECTED'}
                onClick={() => handleUpdateStatus('REJECTED')}
              >
                {isUpdating ? 'Updating...' : 'Reject Application'}
              </Button>
              <Button
                variant="outline"
                size="md"
                disabled={isUpdating || selectedBroker.status === 'SUSPENDED'}
                onClick={() => handleUpdateStatus('SUSPENDED')}
              >
                {isUpdating ? 'Updating...' : 'Suspend Broker'}
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={handleStartEdit}
                disabled={isUpdating}
                style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
              >
                Edit Broker
              </Button>
              {selectedBroker.status === 'APPROVED' && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleImpersonate}
                  disabled={isUpdating}
                  style={{ borderColor: '#10b981', color: '#10b981' }}
                >
                  Login as User
                </Button>
              )}
              <Button
                variant="danger"
                size="md"
                onClick={handleDeleteBroker}
                disabled={isUpdating}
                style={{ marginLeft: 'auto' }}
              >
                Delete Broker
              </Button>
            </div>
          )
        ) : null}
      >
        {selectedBroker && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Status</label>
              <div style={{ marginTop: '4px' }}>
                <StatusBadge status={selectedBroker.status} />
              </div>
            </div>

            {/* Company Info section */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Company Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    className={s.input}
                    style={{ width: '100%', height: 32, fontSize: 13 }}
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                  />
                ) : (
                  <p style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>{selectedBroker.companyName}</p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Contact Person</label>
                {isEditing ? (
                  <input
                    type="text"
                    className={s.input}
                    style={{ width: '100%', height: 32, fontSize: 13 }}
                    value={editContactName}
                    onChange={(e) => setEditContactName(e.target.value)}
                  />
                ) : (
                  <p style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>{selectedBroker.contactName}</p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Contact Email</label>
                {isEditing ? (
                  <input
                    type="email"
                    className={s.input}
                    style={{ width: '100%', height: 32, fontSize: 13 }}
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                ) : (
                  <p style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>{selectedBroker.email}</p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Phone Number</label>
                {isEditing ? (
                  <input
                    type="text"
                    className={s.input}
                    style={{ width: '100%', height: 32, fontSize: 13 }}
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                ) : (
                  <p style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>{selectedBroker.phone || '—'}</p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Country</label>
                {isEditing ? (
                  <input
                    type="text"
                    className={s.input}
                    style={{ width: '100%', height: 32, fontSize: 13 }}
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value)}
                  />
                ) : (
                  <p style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>{selectedBroker.country || '—'}</p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Entity Type</label>
                {isEditing ? (
                  <input
                    type="text"
                    className={s.input}
                    style={{ width: '100%', height: 32, fontSize: 13 }}
                    value={editEntityType}
                    onChange={(e) => setEditEntityType(e.target.value)}
                  />
                ) : (
                  <p style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>{selectedBroker.entityType || '—'}</p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Regulatory License</label>
                {isEditing ? (
                  <input
                    type="text"
                    className={s.input}
                    style={{ width: '100%', height: 32, fontSize: 13 }}
                    value={editRegulatoryLicense}
                    onChange={(e) => setEditRegulatoryLicense(e.target.value)}
                  />
                ) : (
                  <p style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>{selectedBroker.regulatoryLicense || 'None specified'}</p>
                )}
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Business Tax ID</label>
                {isEditing ? (
                  <input
                    type="text"
                    className={s.input}
                    style={{ width: '100%', height: 32, fontSize: 13 }}
                    value={editBusinessTaxId}
                    onChange={(e) => setEditBusinessTaxId(e.target.value)}
                  />
                ) : (
                  <p style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>{selectedBroker.businessTaxId || 'None specified'}</p>
                )}
              </div>
            </div>

            {/* Platform Terms and Registration status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'rgba(255,255,255,0.01)', padding: '12px 16px', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.04)' }}>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Registration Date</label>
                <p style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', fontSize: '12px', margin: 0 }}>
                  {!isMounted ? '—' : (selectedBroker.createdAt ? new Date(selectedBroker.createdAt).toLocaleString() : '—')}
                </p>
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Terms Agreement</label>
                <p style={{ fontWeight: 'var(--font-medium)', color: '#10b981', fontSize: '12px', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>✓ Accepted</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                    {!isMounted ? '' : (selectedBroker.agreementAcceptedAt ? `(${new Date(selectedBroker.agreementAcceptedAt).toLocaleDateString()})` : '')}
                  </span>
                </p>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>KYC Documents</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {selectedBroker.kycDocuments && selectedBroker.kycDocuments.length > 0 ? (
                  selectedBroker.kycDocuments.map((doc, idx) => (
                    <a
                      key={idx}
                      href={`/api/uploads/${doc.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--color-accent)', textDecoration: 'underline', fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>📄</span> {doc.name}
                    </a>
                  ))
                ) : (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', margin: 0 }}>No documents uploaded</p>
                )}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Admin Note / Rejection Reason</label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Enter review notes or reason for rejection..."
                style={{
                  width: '100%', minHeight: '80px', marginTop: '4px', padding: 'var(--space-2)',
                  background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                  borderRadius: 'var(--radius-2)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
                  resize: 'vertical'
                }}
              />
            </div>

            {selectedBroker.status === 'APPROVED' && (
              <div style={{
                marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)'
              }}>
                <label style={{ fontSize: 'var(--text-xs)', color: '#2dd4bf', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>
                  MT5 Managed Direct Connection
                </label>

                {/* Mode Selector Tabs */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 8, marginBottom: 16 }}>
                  <button
                    onClick={() => handleTabClick('DEMO')}
                    style={{
                      flex: 1, padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
                      background: activeTab === 'DEMO' ? 'var(--color-accent)' : 'transparent',
                      color: activeTab === 'DEMO' ? '#111827' : 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    Demo Mode
                  </button>
                  <button
                    onClick={() => handleTabClick('LIVE')}
                    style={{
                      flex: 1, padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
                      background: activeTab === 'LIVE' ? '#10b981' : 'transparent',
                      color: activeTab === 'LIVE' ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    Live Mode
                  </button>
                </div>

                {activeTab === 'DEMO' ? (
                  (selectedBroker as any).demoExecutionAccount ? (
                    <div style={{
                      padding: 14, borderRadius: 8, background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)'
                    }}>
                      <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ color: '#fbbf24' }}>●</span> Connected to Demo MT5
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div><strong>Broker Name:</strong> {((selectedBroker as any).demoExecutionAccount as any).credentials?.brokerName || (selectedBroker as any).demoExecutionAccount.accountName}</div>
                        <div><strong>Server:</strong> {(selectedBroker as any).demoExecutionAccount.serverAddress}</div>
                        <div><strong>Login ID:</strong> {(selectedBroker as any).demoExecutionAccount.accountNumber}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: 14, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center'
                    }}>
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                        Demo Mock MT5 account will be auto-generated when a client places the first trade.
                      </p>
                    </div>
                  )
                ) : (
                  (selectedBroker as any).executionAccount ? (
                    <div style={{
                      padding: 14, borderRadius: 8, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)'
                    }}>
                      <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ color: '#10b981' }}>●</span> Connected to Live MT5
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div><strong>Broker Name:</strong> {((selectedBroker as any).executionAccount as any).credentials?.brokerName || (selectedBroker as any).executionAccount.accountName}</div>
                        <div><strong>Server:</strong> {(selectedBroker as any).executionAccount.serverAddress}</div>
                        <div><strong>Login ID:</strong> {(selectedBroker as any).executionAccount.accountNumber}</div>
                        <div><strong>MetaAPI Account ID:</strong> <code style={{ color: '#10b981', background: 'var(--bg-tertiary)', padding: '2px 4px', borderRadius: 4, fontSize: 10 }}>{((selectedBroker as any).executionAccount as any).credentials?.accountId}</code></div>
                        {((selectedBroker as any).executionAccount as any).credentials?.suffix && (
                          <div><strong>Detected Suffix:</strong> <code style={{ color: '#fbbf24', background: 'var(--bg-tertiary)', padding: '2px 4px', borderRadius: 4, fontSize: 10 }}>{((selectedBroker as any).executionAccount as any).credentials.suffix}</code></div>
                        )}
                      </div>

                      <button
                        onClick={handleDisconnectMt5}
                        disabled={disconnectingMt5}
                        className={s.btnDanger}
                        style={{ marginTop: 14, width: '100%', height: 32, fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                      >
                        {disconnectingMt5 ? 'Disconnecting...' : 'Disconnect MT5 Account'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 4px 0', lineHeight: 1.5 }}>
                        Connect this broker's account directly to MT5 via MetaAPI. Live trades placed by this broker will route directly to their MT5 account.
                      </p>
                      <div>
                        <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>MetaAPI Account ID</label>
                        <input
                          type="text"
                          className={s.input}
                          style={{ width: '100%', height: 32, fontSize: 12 }}
                          value={metaapiAccountId}
                          onChange={(e) => setMetaapiAccountId(e.target.value)}
                          placeholder="e.g. 5fae9c1c..."
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>MetaAPI Access Token</label>
                        <input
                          type="password"
                          className={s.input}
                          style={{ width: '100%', height: 32, fontSize: 12 }}
                          value={metaapiAccessToken}
                          onChange={(e) => setMetaapiAccessToken(e.target.value)}
                          placeholder="Paste MetaAPI access token..."
                        />
                      </div>

                      <button
                        onClick={handleConnectMt5}
                        disabled={connectingMt5}
                        className={s.btnPrimary}
                        style={{ marginTop: 8, height: 36, fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                      >
                        {connectingMt5 ? 'Connecting MetaAPI Account...' : 'Connect MetaAPI Account'}
                      </button>
                    </div>
                  )
                )}
              </div>
            )}


          </div>
        )}
      </SlidePanel>
    </div>
  )
}

