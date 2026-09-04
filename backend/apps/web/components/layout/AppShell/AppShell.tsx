'use client'

import React, { useState, createContext, useContext, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import styles from './AppShell.module.css'

type SidebarState = 'full' | 'collapsed' | 'hidden'

interface ShellContextValue {
  sidebarState: SidebarState
  setSidebarState: (s: SidebarState) => void
  toggleSidebar: () => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used within AppShell')
  return ctx
}

interface NavItem {
  id: string
  label: string
  href: string
  icon: React.ReactNode
  badge?: string | number
  children?: NavItem[]
}

interface AppShellProps {
  navItems: NavItem[]
  userLabel: string
  userRole: string
  children: React.ReactNode
}

export function AppShell({ navItems, userLabel, userRole, children }: AppShellProps) {
  const [sidebarState, setSidebarStateRaw] = useState<SidebarState>('full')

  const setSidebarState = useCallback((s: SidebarState) => setSidebarStateRaw(s), [])

  const toggleSidebar = useCallback(() => {
    setSidebarStateRaw((prev) => {
      if (prev === 'full') return 'collapsed'
      if (prev === 'collapsed') return 'full'
      return 'full'
    })
  }, [])

  return (
    <ShellContext.Provider value={{ sidebarState, setSidebarState, toggleSidebar }}>
      <div className={`${styles.shell} ${styles[sidebarState]}`}>
        {/* Sidebar */}
        <aside className={styles.sidebarWrapper}>
          <Sidebar
            navItems={navItems}
            state={sidebarState}
            onToggle={toggleSidebar}
            userLabel={userLabel}
            userRole={userRole}
          />
        </aside>

        {/* Mobile overlay */}
        {sidebarState === 'full' && (
          <div
            className={styles.mobileOverlay}
            onClick={() => setSidebarState('hidden')}
            aria-hidden="true"
          />
        )}

        {/* Main content */}
        <div className={styles.main}>
          <TopBar onMenuClick={toggleSidebar} />
          <main className={styles.content} id="main-content">
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  )
}
