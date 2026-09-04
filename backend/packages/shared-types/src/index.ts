export const UserRole = {
  SUPER_ADMIN: 'super_admin',
  BROKER: 'broker',
} as const
export type UserRole = typeof UserRole[keyof typeof UserRole]

export const BrokerStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
} as const
export type BrokerStatus = typeof BrokerStatus[keyof typeof BrokerStatus]

export const OrderSide = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const
export type OrderSide = typeof OrderSide[keyof typeof OrderSide]

export const OrderType = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP: 'STOP',
} as const
export type OrderType = typeof OrderType[keyof typeof OrderType]

export const OrderStatus = {
  PENDING: 'PENDING',
  FILLED: 'FILLED',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus]

export const PositionStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PARTIALLY_CLOSED: 'PARTIALLY_CLOSED',
} as const
export type PositionStatus = typeof PositionStatus[keyof typeof PositionStatus]

export const TransactionType = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
} as const
export type TransactionType = typeof TransactionType[keyof typeof TransactionType]

export const TransactionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
} as const
export type TransactionStatus = typeof TransactionStatus[keyof typeof TransactionStatus]

export const CreditAction = {
  ALLOCATE: 'ALLOCATE',
  DEDUCT: 'DEDUCT',
  RELEASE: 'RELEASE',
  ADJUST: 'ADJUST',
} as const
export type CreditAction = typeof CreditAction[keyof typeof CreditAction]

export const SymbolCategory = {
  FOREX: 'FOREX',
  CFD: 'CFD',
  CRYPTO: 'CRYPTO',
  COMMODITY: 'COMMODITY',
  INDEX: 'INDEX',
} as const
export type SymbolCategory = typeof SymbolCategory[keyof typeof SymbolCategory]

export const ExecutionPolicy = {
  REJECT: 'REJECT',
  FILL_AT_LP_PRICE: 'FILL_AT_LP_PRICE',
} as const
export type ExecutionPolicy = typeof ExecutionPolicy[keyof typeof ExecutionPolicy]

export const Currency = {
  USDT: 'USDT',
  BTC: 'BTC',
  ETH: 'ETH',
  USDC: 'USDC',
} as const
export type Currency = typeof Currency[keyof typeof Currency]

// ─── Auth Types ──────────────────────────────────────────────────────────────

export interface AuthTokenPayload {
  sub: string
  email: string
  role: UserRole
  iat: number
  exp: number
}

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

export interface LoginResponse {
  user: AuthUser
  expiresAt: number
}

// ─── Broker Types ────────────────────────────────────────────────────────────

export interface KycDoc {
  name: string
  key: string
  mimeType: string
  uploadedAt: string
}

export interface Broker {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string
  country: string
  regulatoryLicense: string | null
  businessTaxId: string | null
  entityType: string | null
  kycDocuments: KycDoc[]
  adminNote?: string | null
  status: BrokerStatus
  agreementAccepted: boolean
  agreementAcceptedAt?: string | null
  apiEnabled: boolean
  executionAccountId: string | null
  demoExecutionAccountId: string | null
  tradingMode: 'DEMO' | 'LIVE'
  executionAccount?: any
  demoExecutionAccount?: any
  createdAt: string
  approvedAt: string | null
  wallet?: WalletSummary
}

export interface BrokerDetail extends Broker {
  wallet: WalletSummary
  apiCredentials: ApiCredentialMeta[]
}

export interface ApiCredentialMeta {
  id: string
  apiKey: string
  permissions: string[]
  ipWhitelist: string[]
  isActive: boolean
  createdAt: string
  expiresAt: string | null
}

// ─── Wallet Types ────────────────────────────────────────────────────────────

export interface WalletSummary {
  id: string
  brokerId: string
  balances: Record<Currency, string>
  totalCreditUSD: string
  usedCreditUSD: string
  availableCreditUSD: string
  updatedAt: string
}

export interface WalletTransaction {
  id: string
  walletId: string
  type: TransactionType
  currency: Currency
  amount: string
  amountUSD: string
  txHash: string | null
  networkFee: string | null
  status: TransactionStatus
  adminNote: string | null
  createdAt: string
  processedAt: string | null
}

export interface CreditLog {
  id: string
  walletId: string
  action: CreditAction
  amount: string
  reason: string
  previousBalance: string
  newBalance: string
  triggeredBy: string
  createdAt: string
}

// ─── Symbol Types ────────────────────────────────────────────────────────────

export interface TradingSymbol {
  id: string
  name: string
  displayName: string
  category: SymbolCategory
  baseCurrency: string
  quoteCurrency: string
  digits: number
  contractSize: number
  minVolume: string
  maxVolume: string
  stepVolume: string
  rawSpread: string
  rawCommission: string
  rawSwapLong: string
  rawSwapShort: string
  tradingSessionStart: string
  tradingSessionEnd: string
  isActive: boolean
  createdAt: string
}

// ─── Price Feed Types ─────────────────────────────────────────────────────────

export interface PriceTick {
  symbol: string
  bid: string
  ask: string
  spread: string
  timestamp: number
}

export interface BrokerPrice extends PriceTick {
  finalSpread: string
  finalCommission: string
}

// ─── Pricing Profile Types ────────────────────────────────────────────────────

export interface PricingProfile {
  id: string
  brokerId: string
  name: string
  spreadMarkup: string
  commissionMarkup: string
  swapMarkupLong: string
  swapMarkupShort: string
  isDefault: boolean
  createdAt: string
  symbolOverrides: ProfileSymbolOverride[]
}

export interface ProfileSymbolOverride {
  id: string
  profileId: string
  symbolId: string
  symbolName: string
  spreadMarkup: string | null
  commissionOverride: string | null
  swapOverrideLong: string | null
  swapOverrideShort: string | null
}

// ─── Client Types ─────────────────────────────────────────────────────────────

export interface TradingClient {
  id: string
  brokerId: string
  externalClientId: string
  firstName: string
  lastName: string
  email: string
  accountType: string
  leverage: number
  currency: string
  isActive: boolean
  createdAt: string
}

export interface ClientSummary extends TradingClient {
  openPositionsCount: number
  floatingPnl: string
  closedPnlToday: string
}

export interface AdminClientSummary extends ClientSummary {
  brokerCompanyName: string
  brokerEmail: string
  brokerStatus: BrokerStatus
}

export interface AdminClientDetail extends TradingClient {
  broker: {
    id: string
    companyName: string
    email: string
    status: BrokerStatus
  }
  openPositionsCount: number
  floatingPnl: string
  closedPnlToday: string
  orders: Array<{
    id: string
    symbolName: string
    side: OrderSide
    type: OrderType
    status: OrderStatus
    requestedVolume: string
    executionPrice: string | null
    createdAt: string
  }>
  positions: Array<{
    id: string
    symbolName: string
    side: OrderSide
    status: PositionStatus
    volume: string
    openPrice: string
    currentPrice: string
    floatingPnl: string
    closedPnl: string
    commission: string
    openedAt: string
    closedAt: string | null
  }>
}

// ─── Order Types ──────────────────────────────────────────────────────────────

export interface Order {
  id: string
  brokerId: string
  clientId: string
  symbolId: string
  symbolName: string
  side: OrderSide
  type: OrderType
  requestedVolume: string
  filledVolume: string
  requestedPrice: string | null
  executionPrice: string | null
  slippage: string | null
  stopLoss: string | null
  takeProfit: string | null
  status: OrderStatus
  rejectionReason: string | null
  priceValidationPassed: boolean | null
  spreadMarkupRevenue: string
  openedAt: string | null
  closedAt: string | null
  mode: 'DEMO' | 'LIVE'
  createdAt: string
  client?: { firstName: string; lastName: string; email?: string }
  symbol?: { name: string; displayName: string }
}

// ─── Position Types ───────────────────────────────────────────────────────────

export interface Position {
  id: string
  brokerId: string
  clientId: string
  clientName: string
  symbolId: string
  symbolName: string
  leverageAtOpen?: number | null
  marginReservedUSD?: string | null
  side: OrderSide
  volume: string
  openPrice: string
  currentPrice: string
  floatingPnl: string
  closedPnl: string
  swap: string
  commission: string
  status: PositionStatus
  mode: 'DEMO' | 'LIVE'
  openedAt: string
  closedAt: string | null
}

// ─── Execution Account Types ──────────────────────────────────────────────────

export interface ExecutionAccount {
  id: string
  accountName: string
  provider: string
  status: string
  assignedBrokerId: string | null
  assignedBrokerName: string | null
  maxExposure: string
  createdAt: string
}

// ─── Audit Log Types ──────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  entityType: string
  entityId: string
  action: string
  performedBy: string
  performedByRole: UserRole
  previousData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  ipAddress: string
  createdAt: string
}

// ─── Dashboard / Metrics Types ────────────────────────────────────────────────

export interface AdminDashboardMetrics {
  totalBrokers: number
  activeBrokers: number
  pendingApprovals: number
  totalVolumeUSD24h: string
  totalPnlUSD: string
  activePositions: number
  systemAlerts: number
  pendingBrokers?: number
  totalCreditUSD?: string
  usedCreditUSD?: string
  totalVolumeLots?: string
  totalLpRevenue?: string
}

export interface BrokerDashboardMetrics {
  availableCreditUSD: string
  usedCreditUSD: string
  totalClients: number
  openPositions: number
  floatingPnlUSD: string
  closedPnlTodayUSD: string
}

// ─── Pagination Types ─────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface PaginationQuery {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T = void> {
  success: boolean
  data: T
  message?: string
}

export interface ApiError {
  success: false
  statusCode: number
  message: string
  errors?: Record<string, string[]>
}

// ─── WebSocket Event Types ────────────────────────────────────────────────────

export interface WsPriceUpdate {
  symbol: string
  bid: string
  ask: string
  spread?: string
  timestamp: number
}

export interface WsPositionUpdate {
  positionId: string
  floatingPnl: string
  currentPrice: string
  timestamp: number
}

export interface WsOrderExecuted {
  orderId: string
  status: OrderStatus
  executionPrice: string | null
  rejectionReason: string | null
}

export interface WsWalletUpdate {
  availableCreditUSD: string
  usedCreditUSD: string
  totalCreditUSD: string
}

export interface WsBrokerStatusChange {
  brokerId: string
  newStatus: BrokerStatus
}

export interface WsAlert {
  type: 'margin_call' | 'new_registration' | 'large_trade' | 'deposit_request'
  payload: Record<string, unknown>
  timestamp: number
}

// ─── Commission Threshold & Ledger Types ───────────────────────────────────────

export interface BrokerThresholdStatus {
  billingMonth:        string   // "YYYY-MM"
  threshold:           number   // free lots configured
  totalLotsThisMonth:  number
  freeLotsUsed:        number
  freeLotsRemaining:   number
  chargeableLots:      number
  commissionThisMonth: number   // USD
  percentUsed:         number   // 0–100
  commissionPerLot:    number
}

export interface BrokerCommissionLedgerRow {
  billingMonth:      string
  totalLotsTraded:   number
  freeLotsUsed:      number
  chargeableLots:    number
  totalCommission:   number
  thresholdSnapshot: number
}

