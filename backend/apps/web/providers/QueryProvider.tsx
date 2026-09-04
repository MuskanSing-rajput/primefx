'use client'

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import React, { useState } from 'react'
import { handleUnauthorized } from '@/lib/api-client'

if (typeof window !== 'undefined') {
  const originalFetch = window.fetch
  window.fetch = async function (...args) {
    const res = await originalFetch(...args)
    if (res.status === 401) {
      const path = window.location.pathname
      if (!path.startsWith('/login') && !path.startsWith('/register')) {
        handleUnauthorized('expired')
      }
    }
    return res
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error: any) => {
            if (
              error?.status === 401 ||
              error?.statusCode === 401 ||
              error?.message?.includes('401') ||
              error?.message?.toLowerCase().includes('unauthorized')
            ) {
              handleUnauthorized('expired')
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: (error: any) => {
            if (
              error?.status === 401 ||
              error?.statusCode === 401 ||
              error?.message?.includes('401') ||
              error?.message?.toLowerCase().includes('unauthorized')
            ) {
              handleUnauthorized('expired')
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,         // 30 seconds
            gcTime:    5 * 60 * 1000,     // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
