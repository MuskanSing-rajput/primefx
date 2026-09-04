'use client'

import React, { createContext, useContext, useCallback, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    // Read from data-theme attribute set by inline script (SSR-safe)
    const current = document.documentElement.getAttribute('data-theme')
    setThemeState(current === 'light' ? 'light' : 'dark')
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)
    // Store in cookie (1 year expiry, SameSite=Lax)
    document.cookie = `lp_theme=${t}; path=/; max-age=31536000; SameSite=Lax`
    try {
      localStorage.setItem('lp_theme', t)
    } catch (e) {
      // Ignore storage errors
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
