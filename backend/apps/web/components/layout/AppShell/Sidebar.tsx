'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/providers/ThemeProvider'
import styles from './Sidebar.module.css'

interface NavItem {
  id: string
  label: string
  href: string
  icon: React.ReactNode
  badge?: string | number
  children?: NavItem[]
}

interface SidebarProps {
  navItems: NavItem[]
  state: 'full' | 'collapsed' | 'hidden'
  onToggle: () => void
  userLabel: string
  userRole: string
}

export function Sidebar({ navItems, state, onToggle, userLabel, userRole }: SidebarProps) {
  const pathname = usePathname()
  const { theme } = useTheme()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const isCollapsed = state === 'collapsed'

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (e) {
      console.error(e)
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <div className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      {/* ─── Logo / Brand ─────────────────────────────────────── */}
      <div className={styles.brand}>
        <div 
          className={styles.brandIcon}
          style={theme === 'light' ? {
            background: '#000000',
            borderRadius: '50%',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 46,
            height: 46,
          } : undefined}
        >
          <img 
            src="/logo_prime.png" 
            alt="PrimeFX" 
            className={styles.brandLogoImg} 
            style={theme === 'light' ? {
              height: 36,
              width: 36,
            } : undefined}
          />
        </div>
        {!isCollapsed && (
          <div className={styles.brandText}>
            <span className={styles.brandName}>PrimeFX</span>
            <span className={styles.brandRole}>{userRole}</span>
          </div>
        )}
      </div>

      <div className={styles.divider} />

      {/* ─── Navigation ───────────────────────────────────────── */}
      <nav className={styles.nav} aria-label="Main navigation">
        <ul className={styles.navList} role="list">
          {navItems.map((item) => (
            <li key={item.id}>
              {item.children ? (
                /* Group with children */
                <div>
                  <button
                    className={`${styles.navItem} ${expandedGroups.has(item.id) ? styles.groupOpen : ''}`}
                    onClick={() => toggleGroup(item.id)}
                    aria-expanded={expandedGroups.has(item.id)}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    {!isCollapsed && (
                      <>
                        <span className={styles.navLabel}>{item.label}</span>
                        <span className={`${styles.chevron} ${expandedGroups.has(item.id) ? styles.chevronOpen : ''}`}>
                          ›
                        </span>
                      </>
                    )}
                  </button>
                  {!isCollapsed && expandedGroups.has(item.id) && (
                    <ul className={styles.subList} role="list">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={child.href}
                            className={`${styles.subItem} ${isActive(child.href) ? styles.activeSubItem : ''}`}
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                /* Regular nav item */
                <Link
                  href={item.href}
                  className={`${styles.navItem} ${isActive(item.href) ? styles.activeItem : ''}`}
                  title={isCollapsed ? item.label : undefined}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {!isCollapsed && (
                    <>
                      <span className={styles.navLabel}>{item.label}</span>
                      {item.badge !== undefined && (
                        <span className={styles.navBadge}>{item.badge}</span>
                      )}
                    </>
                  )}
                  {isCollapsed && item.badge !== undefined && (
                    <span className={styles.navBadgeDot} />
                  )}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>


      {/* ─── User / Collapse / Logout ────────────────────────────── */}
      <div className={styles.footer}>
        {!isCollapsed && (
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
              {userLabel.charAt(0).toUpperCase()}
            </div>
            <div className={styles.userDetails}>
              <span className={styles.userName}>{userLabel}</span>
              <span className={styles.userRole}>{userRole}</span>
            </div>
            <button
              className={styles.logoutIconBtn}
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOutIcon />
            </button>
          </div>
        )}
        <button
          className={styles.collapseBtn}
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className={`${styles.collapseIcon} ${isCollapsed ? styles.collapseIconFlipped : ''}`}>
            ‹
          </span>
        </button>
      </div>
    </div>
  )
}

function LogOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11.5L14.5 8 11 4.5M14.5 8H5.5" />
    </svg>
  )
}
