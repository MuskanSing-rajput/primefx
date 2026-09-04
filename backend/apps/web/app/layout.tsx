import type { Metadata } from 'next'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { SocketProvider } from '@/providers/SocketProvider'
import { ToastProvider } from '@/providers/ToastProvider'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s | PrimeFX',
    default: 'PrimeFX — Independent Liquidity Provider',
  },
  description:
    'Professional B2B liquidity infrastructure for Forex and CFD brokers. Real-time pricing, order execution, and risk management.',
  robots: 'noindex, nofollow', // Internal B2B platform
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of unstyled content — inline theme script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = document.cookie.match(/(?:^|;\\s*)lp_theme=([^;]*)/);
                  var theme = stored ? stored[1] : localStorage.getItem('lp_theme');
                  if (!theme) {
                    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
                  }
                  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
                } catch(e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <SocketProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </SocketProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
