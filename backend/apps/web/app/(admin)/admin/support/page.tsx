'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface TicketItem {
  id: string
  ticketNumber: string
  subject: string
  category: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  createdAt: string
  lastMessageAt: string
  broker: {
    id: string
    companyName: string
    email: string
    phone?: string
    country?: string
    regulatoryLicense?: string
  }
  messages: Array<{
    id: string
    senderType: 'BROKER' | 'ADMIN'
    senderName: string
    content: string
    createdAt: string
  }>
}

async function fetchAdminTickets(params: { status?: string; priority?: string; brokerId?: string; search?: string }) {
  const query = new URLSearchParams()
  if (params.status && params.status !== 'ALL') query.set('status', params.status)
  if (params.priority && params.priority !== 'ALL') query.set('priority', params.priority)
  if (params.brokerId && params.brokerId !== 'ALL') query.set('brokerId', params.brokerId)
  if (params.search) query.set('search', params.search)

  const res = await fetch(`/api/v1/admin/support/tickets?${query.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch admin tickets')
  const json = await res.json()
  return json.data || json
}

async function fetchAdminTicketDetails(id: string) {
  const res = await fetch(`/api/v1/admin/support/tickets/${id}`)
  if (!res.ok) throw new Error('Failed to fetch ticket details')
  const json = await res.json()
  return (json.data || json) as TicketItem
}

async function fetchApprovedBrokers() {
  const res = await fetch('/api/v1/admin/spread-charges/brokers')
  if (!res.ok) return []
  const json = await res.json()
  return json.data || []
}

async function sendAdminMessageApi(data: { ticketId: string; content: string }) {
  const res = await fetch(`/api/v1/admin/support/tickets/${data.ticketId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: data.content }),
  })
  if (!res.ok) throw new Error('Failed to send admin reply')
  return res.json()
}

async function updateTicketStatusApi(data: { ticketId: string; status?: string; priority?: string }) {
  const res = await fetch(`/api/v1/admin/support/tickets/${data.ticketId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: data.status, priority: data.priority }),
  })
  if (!res.ok) throw new Error('Failed to update ticket status')
  return res.json()
}

async function deleteTicketApi(ticketId: string) {
  const res = await fetch(`/api/v1/admin/support/tickets/${ticketId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete ticket')
  return res.json()
}

export default function AdminSupportPage() {
  const queryClient = useQueryClient()
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [brokerFilter, setBrokerFilter] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  const { data: brokers } = useQuery({
    queryKey: ['admin', 'brokers-list'],
    queryFn: fetchApprovedBrokers,
  })

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['admin', 'support-tickets', statusFilter, priorityFilter, brokerFilter, searchTerm],
    queryFn: () => fetchAdminTickets({ status: statusFilter, priority: priorityFilter, brokerId: brokerFilter, search: searchTerm }),
    refetchInterval: 3000,
  })

  const { data: activeTicket } = useQuery({
    queryKey: ['admin', 'ticket-details', selectedTicketId],
    queryFn: () => fetchAdminTicketDetails(selectedTicketId!),
    enabled: !!selectedTicketId,
    refetchInterval: 3000,
  })

  const replyMutation = useMutation({
    mutationFn: sendAdminMessageApi,
    onSuccess: () => {
      setReplyText('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'ticket-details', selectedTicketId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] })
    },
  })

  const statusMutation = useMutation({
    mutationFn: updateTicketStatusApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ticket-details', selectedTicketId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTicketApi,
    onSuccess: () => {
      setDeletingTicketId(null)
      setSelectedTicketId(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] })
    },
  })

  const tickets = Array.isArray(ticketsData?.tickets) ? ticketsData.tickets : []
  const stats = ticketsData?.stats || { openCount: 0, urgentCount: 0, resolvedCount: 0, total: 0 }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', color: 'var(--text-primary)' }}>
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Super Admin Support Center</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Respond to broker inquiries, manage ticket priorities, and resolve support requests
          </p>
        </div>
      </div>

      {/* ─── Metrics Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-default)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Open Tickets</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>{stats.openCount}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-default)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Urgent Priority</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>{stats.urgentCount}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-default)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Resolved Tickets</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{stats.resolvedCount}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-default)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Tickets</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{stats.total}</div>
        </div>
      </div>

      {/* ─── Filters Bar ─── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="CLOSED">CLOSED</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
        >
          <option value="ALL">All Priorities</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
          <option value="URGENT">URGENT</option>
        </select>

        <select
          value={brokerFilter}
          onChange={(e) => setBrokerFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
        >
          <option value="ALL">All Brokers</option>
          {Array.isArray(brokers) && brokers.map((b: any) => (
            <option key={b.id} value={b.id}>{b.companyName}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search ticket #, subject, broker..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, width: 260, outline: 'none' }}
        />
      </div>

      {/* ─── Split-Pane Workspace ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, height: 'calc(100vh - 270px)', minHeight: 560 }}>
        
        {/* ─── Left Sidebar: All Broker Tickets ─── */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.02)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Ticket Queue ({tickets.length})
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {isLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>No tickets found matching filters.</div>
            ) : (
              tickets.map((t: TicketItem) => {
                const isSelected = selectedTicketId === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      marginBottom: 6,
                      background: isSelected ? 'rgba(96,205,246,0.1)' : 'transparent',
                      border: `1px solid ${isSelected ? 'rgba(96,205,246,0.3)' : 'transparent'}`,
                      cursor: 'pointer',
                      transition: 'all 150ms',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#60cdf6' }}>
                        {t.ticketNumber}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: t.priority === 'URGENT' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)', color: t.priority === 'URGENT' ? '#ef4444' : 'var(--text-secondary)' }}>
                          {t.priority}
                        </span>
                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: t.status === 'OPEN' ? 'rgba(245,158,11,0.15)' : t.status === 'IN_PROGRESS' ? 'rgba(96,205,246,0.15)' : 'rgba(16,185,129,0.15)', color: t.status === 'OPEN' ? '#f59e0b' : t.status === 'IN_PROGRESS' ? '#60cdf6' : '#10b981' }}>
                          {t.status}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.subject}
                    </div>

                    <div style={{ fontSize: 11, color: '#60cdf6', fontWeight: 600, margin: '2px 0 4px 0' }}>
                      🏢 {t.broker?.companyName}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>{t.category}</span>
                      <span>{new Date(t.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ─── Right Area: Ticket Chat & Admin Actions Workspace ─── */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedTicketId || !activeTicket ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎧</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Select a ticket from the left queue to respond</div>
            </div>
          ) : (
            <>
              {/* Workspace Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{activeTicket.subject}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#60cdf6' }}>
                      {activeTicket.ticketNumber}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#60cdf6' }}>
                      🏢 {activeTicket.broker?.companyName} ({activeTicket.broker?.email})
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Category: {activeTicket.category} • Created: {new Date(activeTicket.createdAt).toLocaleString()}
                  </div>
                </div>

                {/* Status, Mark Resolved & Delete Controls */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {activeTicket.status !== 'RESOLVED' && (
                    <button
                      onClick={() => statusMutation.mutate({ ticketId: activeTicket.id, status: 'RESOLVED' })}
                      disabled={statusMutation.isPending}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid rgba(16,185,129,0.4)',
                        background: 'rgba(16,185,129,0.1)',
                        color: '#10b981',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Mark Resolved
                    </button>
                  )}

                  <button
                    onClick={() => setDeletingTicketId(activeTicket.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid rgba(239,68,68,0.4)',
                      background: 'rgba(239,68,68,0.1)',
                      color: '#ef4444',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Delete Ticket
                  </button>

                  <select
                    value={activeTicket.priority}
                    onChange={(e) => statusMutation.mutate({ ticketId: activeTicket.id, priority: e.target.value })}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 11, fontWeight: 700 }}
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>

                  <select
                    value={activeTicket.status}
                    onChange={(e) => statusMutation.mutate({ ticketId: activeTicket.id, status: e.target.value })}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 11, fontWeight: 700 }}
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>
              </div>

              {/* Message Thread */}
              <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {Array.isArray(activeTicket?.messages) && activeTicket.messages.map((msg) => {
                  const isAdmin = msg.senderType === 'ADMIN'
                  return (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: isAdmin ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textAlign: isAdmin ? 'right' : 'left' }}>
                        {msg.senderName} ({msg.senderType}) • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      <div
                        style={{
                          padding: '12px 16px',
                          borderRadius: 12,
                          borderTopRightRadius: isAdmin ? 2 : 12,
                          borderTopLeftRadius: isAdmin ? 12 : 2,
                          background: isAdmin ? '#60cdf6' : 'rgba(255,255,255,0.06)',
                          color: isAdmin ? '#000' : 'var(--text-primary)',
                          fontSize: 13,
                          lineHeight: 1.5,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reply Input Box & Templates */}
              <div style={{ padding: 16, borderTop: '1px solid var(--border-default)', background: 'var(--bg-tertiary)' }}>
                {/* Quick Response Templates */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Templates:</span>
                  {[
                    'We are investigating your request with the tech team.',
                    'Your deposit has been verified and wallet credited.',
                    'Please verify your API key permissions under Broker API tab.',
                    'Issue has been resolved. Please test and confirm.',
                  ].map((tpl, i) => (
                    <button
                      key={i}
                      onClick={() => setReplyText(tpl)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border-default)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'var(--text-secondary)',
                        fontSize: 11,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tpl.slice(0, 30)}...
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (replyText.trim()) {
                      replyMutation.mutate({ ticketId: activeTicket.id, content: replyText })
                    }
                  }}
                  style={{ display: 'flex', gap: 12 }}
                >
                  <input
                    type="text"
                    placeholder="Type Super Admin response..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={replyMutation.isPending || !replyText.trim()}
                    style={{
                      padding: '12px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#60cdf6',
                      color: '#000',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: replyMutation.isPending || !replyText.trim() ? 'not-allowed' : 'pointer',
                      opacity: replyMutation.isPending || !replyText.trim() ? 0.6 : 1,
                    }}
                  >
                    {replyMutation.isPending ? 'Sending...' : 'Send Response 🚀'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Delete Confirmation Modal ─── */}
      {deletingTicketId && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', padding: 24, boxShadow: 'var(--shadow-panel)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px 0', color: '#ef4444' }}>
              Delete Support Ticket
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete this ticket and all associated message history? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingTicketId(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deletingTicketId)}
                disabled={deleteMutation.isPending}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer', opacity: deleteMutation.isPending ? 0.7 : 1 }}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Confirm & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
