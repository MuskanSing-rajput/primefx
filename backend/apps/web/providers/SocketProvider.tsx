'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { io, Socket } from 'socket.io-client'
import { WS_BASE, WS_NAMESPACES, WS_EVENTS } from '@lp/constants'
import type { WsPriceUpdate, WsPositionUpdate, WsWalletUpdate, WsAlert } from '@lp/shared-types'
import { useQueryClient } from '@tanstack/react-query'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface SocketContextValue {
  status: ConnectionStatus
  pricesSocket: Socket | null
  accountSocket: Socket | null
  adminSocket: Socket | null
}

const SocketContext = createContext<SocketContextValue>({
  status: 'disconnected',
  pricesSocket: null,
  accountSocket: null,
  adminSocket: null,
})

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const pricesRef = useRef<Socket | null>(null)
  const accountRef = useRef<Socket | null>(null)
  const adminRef = useRef<Socket | null>(null)
  const queryClient = useQueryClient()

  const connectSockets = useCallback(() => {
    const socketOptions = {
      withCredentials: true,         // Send HttpOnly cookies for auth
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    }

    // ─── Prices namespace ──────────────────────────────────────────
    const pricesSocket = io(`${WS_BASE}${WS_NAMESPACES.PRICES}`, socketOptions)
    pricesRef.current = pricesSocket

    pricesSocket.on('connect', () => setStatus('connected'))
    pricesSocket.on('disconnect', () => setStatus('disconnected'))
    pricesSocket.on('connect_error', () => setStatus('error'))

    pricesSocket.on(WS_EVENTS.PRICE_UPDATE, (update: WsPriceUpdate) => {
      // Update React Query cache — no re-fetch, just direct cache update
      queryClient.setQueryData<WsPriceUpdate>(['price', update.symbol], update)
    })

    // ─── Account namespace ─────────────────────────────────────────
    const accountSocket = io(`${WS_BASE}${WS_NAMESPACES.ACCOUNT}`, socketOptions)
    accountRef.current = accountSocket

    accountSocket.on(WS_EVENTS.POSITION_UPDATE, (update: WsPositionUpdate) => {
      queryClient.setQueryData(
        ['positions', 'live', update.positionId],
        (old: WsPositionUpdate | undefined) => ({ ...old, ...update }),
      )
    })

    accountSocket.on(WS_EVENTS.ORDER_EXECUTED, (order: any) => {
      // Prepend to recent orders dashboard cache and trim
      queryClient.setQueryData(['orders', 'recent-dash'], (old: any[] | undefined) => {
        const list = Array.isArray(old) ? old : []
        return [order, ...list].slice(0, 20)
      })
      // Also invalidate reports that depend on orders
      queryClient.invalidateQueries({ queryKey: ['reports', 'revenue'] })
      queryClient.invalidateQueries({ queryKey: ['reports', 'trades'] })
    })

    accountSocket.on(WS_EVENTS.WALLET_UPDATE, (update: WsWalletUpdate) => {
      queryClient.setQueryData(['wallet', 'summary'], (old: object | undefined) => ({
        ...(old ?? {}),
        ...update,
      }))
    })

    // ─── Admin namespace ───────────────────────────────────────────
    const adminSocket = io(`${WS_BASE}${WS_NAMESPACES.ADMIN}`, socketOptions)
    adminRef.current = adminSocket

    adminSocket.on(WS_EVENTS.ALERT, (_alert: WsAlert) => {
      // Invalidate admin dashboard cache on new alerts
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
    })

    setStatus('connecting')
  }, [queryClient])

  useEffect(() => {
    connectSockets()

    return () => {
      pricesRef.current?.disconnect()
      accountRef.current?.disconnect()
      adminRef.current?.disconnect()
    }
  }, [connectSockets])

  return (
    <SocketContext.Provider
      value={{
        status,
        pricesSocket: pricesRef.current,
        accountSocket: accountRef.current,
        adminSocket: adminRef.current,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export function useSocketContext(): SocketContextValue {
  return useContext(SocketContext)
}

export function useConnectionStatus(): ConnectionStatus {
  return useContext(SocketContext).status
}
