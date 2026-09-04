'use client'

import { useState, useEffect } from 'react'
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
  hasUnreadAdminReply?: boolean
  messages: Array<{
    id: string
    senderType: 'BROKER' | 'ADMIN'
    senderName: string
    content: string
    createdAt: string
  }>
}

async function fetchBrokerTickets() {
  const res = await fetch('/api/v1/broker/support/tickets')
  if (!res.ok) throw new Error('Failed to fetch support tickets')
  const json = await res.json()
  return json.data || json
}

async function fetchTicketDetails(id: string) {
  const res = await fetch(`/api/v1/broker/support/tickets/${id}`)
  if (!res.ok) throw new Error('Failed to fetch ticket thread')
  const json = await res.json()
  return (json.data || json) as TicketItem
}

async function createTicketApi(data: { subject: string; category: string; priority: string; message: string }) {
  const res = await fetch('/api/v1/broker/support/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Failed to create ticket')
  }
  return res.json()
}

async function sendMessageApi(data: { ticketId: string; content: string }) {
  const res = await fetch(`/api/v1/broker/support/tickets/${data.ticketId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: data.content }),
  })
  if (!res.ok) throw new Error('Failed to send reply')
  return res.json()
}

async function resolveTicketApi(ticketId: string) {
  const res = await fetch(`/api/v1/broker/support/tickets/${ticketId}/resolve`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to resolve ticket')
  return res.json()
}

export default function BrokerSupportPage() {
  const queryClient = useQueryClient()
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newCategory, setNewCategory] = useState('GENERAL')
  const [newPriority, setNewPriority] = useState('MEDIUM')
  const [newMessage, setNewMessage] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const markTicketAsRead = async (id: string) => {
    try {
      await fetch(`/api/v1/broker/support/tickets/${id}/read`, { method: 'POST' })
      queryClient.invalidateQueries({ queryKey: ['broker', 'support-tickets'] })
      queryClient.invalidateQueries({ queryKey: ['broker', 'notifications'] })
    } catch (err) {
      console.error('Failed to mark support ticket as read:', err)
    }
  }

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['broker', 'support-tickets'],
    queryFn: fetchBrokerTickets,
    refetchInterval: 4000,
  })

  const tickets = Array.isArray(ticketsData?.tickets) ? ticketsData.tickets : []

  const { data: activeTicket } = useQuery({
    queryKey: ['broker', 'ticket-details', selectedTicketId],
    queryFn: () => fetchTicketDetails(selectedTicketId!),
    enabled: !!selectedTicketId,
    refetchInterval: 3000,
  })

  const createMutation = useMutation({
    mutationFn: createTicketApi,
    onSuccess: (res) => {
      setShowCreateModal(false)
      setNewSubject('')
      setNewMessage('')
      setCreateError(null)
      queryClient.invalidateQueries({ queryKey: ['broker', 'support-tickets'] })
      if (res?.ticket?.id) setSelectedTicketId(res.ticket.id)
    },
    onError: (err: any) => setCreateError(err.message),
  })

  const replyMutation = useMutation({
    mutationFn: sendMessageApi,
    onSuccess: () => {
      setReplyText('')
      queryClient.invalidateQueries({ queryKey: ['broker', 'ticket-details', selectedTicketId] })
      queryClient.invalidateQueries({ queryKey: ['broker', 'support-tickets'] })
    },
  })

  const resolveMutation = useMutation({
    mutationFn: resolveTicketApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker', 'ticket-details', selectedTicketId] })
      queryClient.invalidateQueries({ queryKey: ['broker', 'support-tickets'] })
    },
  })

  const stats = ticketsData?.stats || { openCount: 0, resolvedCount: 0, total: 0 }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', color: 'var(--text-primary)' }}>
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Broker Support Desk</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Get direct assistance from Super Admin support team
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#60cdf6',
            color: '#000',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ➕ Raise New Ticket
        </button>
      </div>

      {/* ─── Main Split-Pane Layout ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, height: 'calc(100vh - 180px)', minHeight: 600 }}>
        
        {/* ─── Left Sidebar: Tickets List ─── */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* List Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              <span>Your Tickets ({stats.total})</span>
              <span>{stats.openCount} Open / {stats.resolvedCount} Resolved</span>
            </div>
          </div>

          {/* List Items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {isLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                Loading tickets...
              </div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                No support tickets found. Click "Raise New Ticket" to start.
              </div>
            ) : (
              tickets.map((t: TicketItem) => {
                const isSelected = selectedTicketId === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTicketId(t.id)
                      if (t.hasUnreadAdminReply) {
                        markTicketAsRead(t.id)
                      }
                    }}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#60cdf6' }}>
                          {t.ticketNumber}
                        </span>
                        {t.hasUnreadAdminReply && (
                          <span style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#3b82f6',
                            boxShadow: '0 0 6px #3b82f6',
                            display: 'inline-block'
                          }} />
                        )}
                      </div>
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          background: t.status === 'OPEN' ? 'rgba(245,158,11,0.15)' : t.status === 'IN_PROGRESS' ? 'rgba(96,205,246,0.15)' : 'rgba(16,185,129,0.15)',
                          color: t.status === 'OPEN' ? '#f59e0b' : t.status === 'IN_PROGRESS' ? '#60cdf6' : '#10b981',
                        }}
                      >
                        {t.status}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                      {t.subject}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span>{t.category}</span>
                      <span>{new Date(t.lastMessageAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ─── Right Area: Active Ticket Chat Workspace ─── */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedTicketId || !activeTicket ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Select a support ticket to view conversation thread</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Or raise a new ticket using the button above</div>
            </div>
          ) : (
            <>
              {/* Active Ticket Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{activeTicket.subject}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#60cdf6' }}>
                      {activeTicket.ticketNumber}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: activeTicket.priority === 'URGENT' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)', color: activeTicket.priority === 'URGENT' ? '#ef4444' : 'var(--text-secondary)' }}>
                      {activeTicket.priority}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Category: {activeTicket.category} • Created: {new Date(activeTicket.createdAt).toLocaleString()}
                  </div>
                </div>

                {activeTicket.status !== 'RESOLVED' && (
                  <button
                    onClick={() => resolveMutation.mutate(activeTicket.id)}
                    disabled={resolveMutation.isPending}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 6,
                      border: '1px solid rgba(16,185,129,0.4)',
                      background: 'rgba(16,185,129,0.1)',
                      color: '#10b981',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ✓ Mark as Resolved
                  </button>
                )}
              </div>

              {/* Chat Message Thread */}
              <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {Array.isArray(activeTicket?.messages) && activeTicket.messages.map((msg) => {
                  const isBroker = msg.senderType === 'BROKER'
                  return (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: isBroker ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textAlign: isBroker ? 'right' : 'left' }}>
                        {msg.senderName} ({msg.senderType}) • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      <div
                        style={{
                          padding: '12px 16px',
                          borderRadius: 12,
                          borderTopRightRadius: isBroker ? 2 : 12,
                          borderTopLeftRadius: isBroker ? 12 : 2,
                          background: isBroker ? '#60cdf6' : 'rgba(255,255,255,0.06)',
                          color: isBroker ? '#000' : 'var(--text-primary)',
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

              {/* Chat Reply Input Box */}
              <div style={{ padding: 16, borderTop: '1px solid var(--border-default)', background: 'rgba(0,0,0,0.1)' }}>
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
                    placeholder="Type your message reply here..."
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
                    {replyMutation.isPending ? 'Sending...' : 'Send Reply 🚀'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Raise Ticket Modal ─── */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ width: '100%', maxWidth: 500, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>Raise Support Ticket</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Subject / Issue Title *
                </label>
                <input
                  type="text"
                  placeholder="Brief description of your issue"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                  >
                    <option value="GENERAL">General Enquiry</option>
                    <option value="API_INTEGRATION">API & Algo Connect</option>
                    <option value="DEPOSIT_WITHDRAWAL">Deposit & Wallet</option>
                    <option value="EXECUTION">Order Execution</option>
                    <option value="BILLING">Spread & Charges</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Detailed Description *
                </label>
                <textarea
                  rows={5}
                  placeholder="Provide full details, timestamps, or steps to reproduce..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'vertical' }}
                />
              </div>

              {createError && (
                <div style={{ padding: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 6, fontSize: 12 }}>
                  {createError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate({ subject: newSubject, category: newCategory, priority: newPriority, message: newMessage })}
                disabled={createMutation.isPending || !newSubject.trim() || !newMessage.trim()}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#60cdf6', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: createMutation.isPending || !newSubject.trim() || !newMessage.trim() ? 0.6 : 1 }}
              >
                {createMutation.isPending ? 'Submitting...' : 'Submit Support Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
