// ─── API Endpoints ────────────────────────────────────────────────────────────

export const API_BASE = typeof window !== 'undefined'
  ? `${window.location.origin}/api/v1`
  : (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001/api/v1')

export const WS_BASE = typeof window !== 'undefined'
  ? window.location.origin
  : (process.env['NEXT_PUBLIC_WS_URL'] ?? 'http://localhost:3001')

export const API_ROUTES = {
  // Auth
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    REGISTER: '/auth/register',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    VERIFY_2FA: '/auth/verify-2fa',
    ME: '/auth/me',
  },

  // Brokers (Admin)
  BROKERS: {
    LIST: '/brokers',
    DETAIL: (id: string) => `/brokers/${id}`,
    STATUS: (id: string) => `/brokers/${id}/status`,
    DELETE: (id: string) => `/brokers/${id}`,
  },

  // Wallet
  WALLET: {
    SUMMARY: '/wallet',
    TRANSACTIONS: '/wallet/transactions',
    DEPOSIT: '/wallet/deposit',
    WITHDRAW: '/wallet/withdraw',
    APPROVE_TRANSACTION: (id: string) => `/wallet/transactions/${id}/approve`,
    ALLOCATE_CREDIT: '/wallet/credit/allocate',
    ADJUST_CREDIT: '/wallet/credit/adjust',
  },

  // Symbols
  SYMBOLS: {
    LIST: '/symbols',
    DETAIL: (id: string) => `/symbols/${id}`,
    CREATE: '/symbols',
    UPDATE: (id: string) => `/symbols/${id}`,
    DELETE: (id: string) => `/symbols/${id}`,
  },

  // Pricing
  PRICING: {
    PROFILES: '/pricing/profiles',
    PROFILE: (id: string) => `/pricing/profiles/${id}`,
    PROFILE_SYMBOLS: (id: string) => `/pricing/profiles/${id}/symbols`,
    RAW: '/admin/pricing/raw',
    LIMITS: '/admin/pricing/limits',
  },

  // Clients
  CLIENTS: {
    LIST: '/clients',
    DETAIL: (id: string) => `/clients/${id}`,
    CREATE: '/clients',
    UPDATE: (id: string) => `/clients/${id}`,
    DELETE: (id: string) => `/clients/${id}`,
  },

  // Trading
  TRADING: {
    ORDERS: '/orders',
    ORDER: (id: string) => `/orders/${id}`,
    CLOSE_ORDER: (id: string) => `/orders/${id}/close`,
    MODIFY_ORDER: (id: string) => `/orders/${id}/modify`,
    POSITIONS: '/positions',
    CLOSED_POSITIONS: '/positions/closed',
    POSITION: (id: string) => `/positions/${id}`,
  },

  // Execution
  EXECUTION: {
    ACCOUNTS: '/execution-accounts',
    ACCOUNT: (id: string) => `/execution-accounts/${id}`,
    ASSIGN: (id: string) => `/execution-accounts/${id}/assign`,
  },

  // Admin
  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    EXPOSURE: '/admin/exposure',
    ALERTS: '/admin/alerts',
    SETTINGS: '/admin/settings',
    AUDIT_LOGS: '/audit-logs',
  },

  // Reports
  REPORTS: {
    TRADES: '/reports/trades',
    PNL: '/reports/pnl',
    WALLET: '/reports/wallet',
    EXPOSURE: '/reports/exposure',
  },
} as const

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export const WS_EVENTS = {
  // Incoming (server → client)
  PRICE_UPDATE: 'price:update',
  POSITION_UPDATE: 'position:update',
  ORDER_EXECUTED: 'order:executed',
  WALLET_UPDATE: 'wallet:update',
  BROKER_STATUS_CHANGE: 'broker:statusChange',
  ALERT: 'alert',

  // Outgoing (client → server)
  SUBSCRIBE_PRICES: 'subscribe:prices',
  UNSUBSCRIBE_PRICES: 'unsubscribe:prices',
  SUBSCRIBE_ACCOUNT: 'subscribe:account',
} as const

export const WS_NAMESPACES = {
  PRICES: '/prices',
  ACCOUNT: '/account',
  ADMIN: '/admin',
} as const

// ─── Trading Constants ────────────────────────────────────────────────────────

export const DEFAULT_SYMBOLS = [
  // Major Forex Pairs
  { name: 'EURUSD', displayName: 'Euro / US Dollar', category: 'FOREX', digits: 5 },
  { name: 'GBPUSD', displayName: 'British Pound / US Dollar', category: 'FOREX', digits: 5 },
  { name: 'USDJPY', displayName: 'US Dollar / Japanese Yen', category: 'FOREX', digits: 3 },
  { name: 'USDCHF', displayName: 'US Dollar / Swiss Franc', category: 'FOREX', digits: 5 },
  { name: 'AUDUSD', displayName: 'Australian Dollar / US Dollar', category: 'FOREX', digits: 5 },
  { name: 'NZDUSD', displayName: 'New Zealand Dollar / US Dollar', category: 'FOREX', digits: 5 },
  { name: 'USDCAD', displayName: 'US Dollar / Canadian Dollar', category: 'FOREX', digits: 5 },
  // Minor Pairs
  { name: 'EURGBP', displayName: 'Euro / British Pound', category: 'FOREX', digits: 5 },
  { name: 'EURJPY', displayName: 'Euro / Japanese Yen', category: 'FOREX', digits: 3 },
  { name: 'GBPJPY', displayName: 'British Pound / Japanese Yen', category: 'FOREX', digits: 3 },
  // Metals
  { name: 'XAUUSD', displayName: 'Gold / US Dollar', category: 'COMMODITY', digits: 2 },
  { name: 'XAGUSD', displayName: 'Silver / US Dollar', category: 'COMMODITY', digits: 4 },
  // Crypto
  { name: 'BTCUSD', displayName: 'Bitcoin / US Dollar', category: 'CRYPTO', digits: 2 },
  { name: 'ETHUSD', displayName: 'Ethereum / US Dollar', category: 'CRYPTO', digits: 2 },
  // Indices
  { name: 'US30', displayName: 'Dow Jones 30', category: 'INDEX', digits: 2 },
  { name: 'SPX500', displayName: 'S&P 500', category: 'INDEX', digits: 2 },
  { name: 'NAS100', displayName: 'NASDAQ 100', category: 'INDEX', digits: 2 },
] as const

// ─── App Constants ────────────────────────────────────────────────────────────

export const APP_NAME = 'LP Platform'
export const APP_VERSION = '1.0.0'

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
} as const

export const JWT_CONSTANTS = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  ACCESS_TOKEN_COOKIE_MAX_AGE: 15 * 60, // 15 minutes in seconds
  REFRESH_TOKEN_COOKIE_MAX_AGE: 7 * 24 * 60 * 60, // 7 days in seconds
} as const

export const RATE_LIMITS = {
  LOGIN_ATTEMPTS: 5,
  LOGIN_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  GENERAL_REQUESTS: 100,
  GENERAL_WINDOW_MS: 60 * 1000, // 1 minute
} as const

export const PRICE_VALIDATION = {
  DEFAULT_MAX_AGE_MS: 5000, // 5 seconds
  DEFAULT_MAX_DEVIATION_PIPS: 3,
} as const

export const REDIS_KEYS = {
  PRICE: (symbol: string) => `price:${symbol}`,
  SESSION: (userId: string) => `session:${userId}`,
  RATE: (ip: string, endpoint: string) => `rate:${ip}:${endpoint}`,
  BROKER_CACHE: (brokerId: string, key: string) => `cache:broker:${brokerId}:${key}`,
} as const

export const BULLMQ_QUEUES = {
  WALLET_RECONCILE: 'wallet:reconcile',
  PNL_CALCULATOR: 'pnl:calculator',
  PNL_SNAPSHOT: 'pnl:snapshot',
  MARGIN_CHECK: 'margin:check',
  SWAP_APPLY: 'swap:apply',
  REPORT_GENERATE: 'report:generate',
  DAILY_SUMMARY: 'report:daily-summary',
} as const
