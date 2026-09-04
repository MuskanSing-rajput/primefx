import { z } from 'zod'

// ─── Auth Validators ──────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const RegisterBrokerSchema = z.object({
  // Step 1: Company Info
  companyName: z.string().min(2).max(100),
  country: z.string().min(2).max(60),
  regulatoryLicense: z.string().max(100).optional(),
  businessTaxId: z.string().min(2, 'Business registration / Tax ID is required').max(100),
  entityType: z.string().min(2, 'Entity type is required').max(100),

  // Step 2: Contact Details
  contactName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain uppercase, lowercase, and a number',
    ),

  // Step 3: KYC Documents
  kycDocuments: z
    .array(
      z.object({
        name: z.string(),
        key: z.string(),
        mimeType: z.string(),
        uploadedAt: z.string(),
      }),
    )
    .optional(),

  // Step 4: Agreement
  agreementAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the agreement' }),
  }),
})

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const ResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .max(128)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

// ─── Broker Validators ────────────────────────────────────────────────────────

export const UpdateBrokerSchema = z.object({
  companyName: z.string().min(2).max(100).optional(),
  contactName: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(7).max(20).optional(),
  country: z.string().min(2).max(60).optional(),
  regulatoryLicense: z.string().max(100).nullable().optional(),
  businessTaxId: z.string().min(2).max(100).optional(),
  entityType: z.string().min(2).max(100).optional(),
  kycDocuments: z
    .array(
      z.object({
        name: z.string(),
        key: z.string(),
        mimeType: z.string(),
        uploadedAt: z.string(),
      }),
    )
    .optional(),
})

export const UpdateBrokerStatusSchema = z.object({
  status: z.enum(['APPROVED', 'SUSPENDED', 'REJECTED']),
  adminNote: z.string().max(500).optional(),
})

// ─── Wallet Validators ────────────────────────────────────────────────────────

export const DepositRequestSchema = z.object({
  currency: z.enum(['USDT', 'BTC', 'ETH', 'USDC']),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,8})?$/, 'Invalid amount')
    .refine((v) => parseFloat(v) > 0, 'Amount must be positive'),
  txHash: z.string().min(1, 'Transaction hash is required'),
  network: z.string().optional(),
})

export const WithdrawalRequestSchema = z.object({
  currency: z.enum(['USDT', 'BTC', 'ETH', 'USDC']),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,8})?$/, 'Invalid amount')
    .refine((v) => parseFloat(v) > 0, 'Amount must be positive'),
  destinationAddress: z.string().min(10, 'Invalid wallet address'),
  totpCode: z.string().length(6, 'Invalid 2FA code'),
})

export const AllocateCreditSchema = z.object({
  brokerId: z.string().uuid(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .refine((v) => parseFloat(v) > 0),
  reason: z.string().min(3).max(500),
})

// ─── Symbol Validators ────────────────────────────────────────────────────────

export const CreateSymbolSchema = z.object({
  name: z.string().min(3).max(20).toUpperCase(),
  displayName: z.string().min(3).max(40),
  category: z.enum(['FOREX', 'CFD', 'CRYPTO', 'COMMODITY', 'INDEX']),
  baseCurrency: z.string().min(2).max(10),
  quoteCurrency: z.string().min(2).max(10),
  digits: z.number().int().min(0).max(8),
  contractSize: z.number().positive(),
  minVolume: z.string().regex(/^\d+(\.\d+)?$/),
  maxVolume: z.string().regex(/^\d+(\.\d+)?$/),
  stepVolume: z.string().regex(/^\d+(\.\d+)?$/),
  rawSpread: z.string().regex(/^\d+(\.\d+)?$/),
  rawCommission: z.string().regex(/^\d+(\.\d+)?$/),
  rawSwapLong: z.string().regex(/^-?\d+(\.\d+)?$/),
  rawSwapShort: z.string().regex(/^-?\d+(\.\d+)?$/),
  tradingSessionStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  tradingSessionEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
})

export const UpdateSymbolSchema = CreateSymbolSchema.partial().omit({ name: true })

// ─── Pricing Profile Validators ───────────────────────────────────────────────

export const CreatePricingProfileSchema = z.object({
  name: z.string().min(2).max(60),
  spreadMarkup: z.string().regex(/^\d+(\.\d+)?$/),
  commissionMarkup: z.string().regex(/^\d+(\.\d+)?$/),
  swapMarkupLong: z.string().regex(/^-?\d+(\.\d+)?$/),
  swapMarkupShort: z.string().regex(/^-?\d+(\.\d+)?$/),
  isDefault: z.boolean().optional(),
})

export const UpdatePricingProfileSchema = CreatePricingProfileSchema.partial()

export const ProfileSymbolOverrideSchema = z.object({
  symbolId: z.string().uuid(),
  spreadMarkup: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  commissionOverride: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  swapOverrideLong: z.string().regex(/^-?\d+(\.\d+)?$/).nullable().optional(),
  swapOverrideShort: z.string().regex(/^-?\d+(\.\d+)?$/).nullable().optional(),
})

// ─── Client Validators ────────────────────────────────────────────────────────

export const CreateClientSchema = z.object({
  externalClientId: z.string().min(1).max(100),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  accountType: z.enum(['standard', 'ecn', 'raw']),
  leverage: z.number().int().min(1).max(500),
  currency: z.string().length(3),
})

export const UpdateClientSchema = CreateClientSchema.partial().omit({ externalClientId: true })

// ─── Order Validators ─────────────────────────────────────────────────────────

export const PlaceOrderSchema = z
  .object({
    clientId: z.string().uuid().optional().nullable(),
    symbolId: z.string().uuid().optional().nullable(),
    symbol: z.string().min(1).max(30).optional().nullable(),
    side: z.enum(['BUY', 'SELL']),
    type: z.enum(['MARKET', 'LIMIT', 'STOP']).default('MARKET'),
    volume: z
      .union([
        z.string().regex(/^\d+(\.\d+)?$/),
        z.number().positive(),
      ])
      .transform((v) => String(v))
      .refine((v) => parseFloat(v) > 0, 'Volume must be positive'),
    requestedPrice: z
      .union([z.string().regex(/^\d+(\.\d+)?$/), z.number().positive()])
      .transform((v) => String(v))
      .optional()
      .nullable(),
    stopLoss: z
      .union([z.string().regex(/^\d+(\.\d+)?$/), z.number().positive()])
      .transform((v) => String(v))
      .optional()
      .nullable(),
    takeProfit: z
      .union([z.string().regex(/^\d+(\.\d+)?$/), z.number().positive()])
      .transform((v) => String(v))
      .optional()
      .nullable(),
    pricingProfileId: z.string().uuid().optional().nullable(),
    externalId: z.string().max(100).optional().nullable(),
    clientReference: z.string().max(100).optional().nullable(),
    comment: z.string().max(255).optional().nullable(),
  })
  .refine((data) => Boolean(data.symbolId || data.symbol), {
    message: 'Either symbolId or symbol must be provided',
    path: ['symbol'],
  })

export const ModifyOrderSchema = z.object({
  stopLoss: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  takeProfit: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
})

// ─── Execution Account Validators ─────────────────────────────────────────────

export const CreateExecutionAccountSchema = z.object({
  accountName: z.string().min(2).max(100),
  provider: z.string().min(2).max(100),
  accountNumber: z.string().min(1).max(100),
  serverAddress: z.string().min(1).max(200),
  maxExposure: z.string().regex(/^\d+(\.\d+)?$/),
  credentials: z.object({
    login: z.string(),
    password: z.string(),
  }),
})

// ─── Admin Settings Validators ────────────────────────────────────────────────

export const UpdateSystemSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(1000),
})

export const UpdateRawPricingSchema = z.object({
  symbolId: z.string().uuid(),
  rawSpread: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  rawCommission: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  rawSwapLong: z.string().regex(/^-?\d+(\.\d+)?$/).optional(),
  rawSwapShort: z.string().regex(/^-?\d+(\.\d+)?$/).optional(),
})

// ─── Pagination Validators ────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  sortBy: z.string().max(60).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

// ─── Institutional Access / Inquiry Validators ────────────────────────────────

export const InstitutionalAccessSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  workEmail: z.string().email('Invalid work email address'),
  brokerageFirm: z.string().min(2, 'Brokerage / Firm name is required').max(100),
  estMonthlyVolume: z.string().min(1, 'Estimated monthly volume is required'),
  inquiryDetails: z.string().max(2000, 'Inquiry details cannot exceed 2000 characters').optional().nullable(),
})

// ─── MT5 Managed Connection Validators ───────────────────────────────────────

export const ConnectMt5Schema = z.object({
  accountId: z.string().min(1, 'MetaAPI Account ID is required').max(100),
  token: z.string().min(1, 'MetaAPI Access Token is required').max(500),
})

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterBrokerInput = z.infer<typeof RegisterBrokerSchema>
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
export type UpdateBrokerInput = z.infer<typeof UpdateBrokerSchema>
export type UpdateBrokerStatusInput = z.infer<typeof UpdateBrokerStatusSchema>
export type DepositRequestInput = z.infer<typeof DepositRequestSchema>
export type WithdrawalRequestInput = z.infer<typeof WithdrawalRequestSchema>
export type AllocateCreditInput = z.infer<typeof AllocateCreditSchema>
export type CreateSymbolInput = z.infer<typeof CreateSymbolSchema>
export type UpdateSymbolInput = z.infer<typeof UpdateSymbolSchema>
export type CreatePricingProfileInput = z.infer<typeof CreatePricingProfileSchema>
export type UpdatePricingProfileInput = z.infer<typeof UpdatePricingProfileSchema>
export type ProfileSymbolOverrideInput = z.infer<typeof ProfileSymbolOverrideSchema>
export type CreateClientInput = z.infer<typeof CreateClientSchema>
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>
export type PlaceOrderInput = z.infer<typeof PlaceOrderSchema>
export type ModifyOrderInput = z.infer<typeof ModifyOrderSchema>
export type CreateExecutionAccountInput = z.infer<typeof CreateExecutionAccountSchema>
export type PaginationQueryInput = z.infer<typeof PaginationQuerySchema>
export type InstitutionalAccessInput = z.infer<typeof InstitutionalAccessSchema>
export type ConnectMt5Input = z.infer<typeof ConnectMt5Schema>

// ─── Data Streaming Validators ───────────────────────────────────────────────

export const StreamingConfigSchema = z.object({
  source: z.enum(['default', 'deriv', 'metaapi', 'infoway']),
  derivAppId: z.string().optional().nullable(),
  metaapiAppId: z.string().optional().nullable(),
  metaapiToken: z.string().optional().nullable(),
  infowayApiUrl: z.string().optional().nullable(),
  infowayApiKey: z.string().optional().nullable(),
})

export type StreamingConfigInput = z.infer<typeof StreamingConfigSchema>

export const StreamingTestConnectionSchema = z.object({
  source: z.enum(['deriv', 'metaapi', 'infoway']),
  config: z.object({
    appId: z.string().optional().nullable(),
    token: z.string().optional().nullable(),
    apiUrl: z.string().optional().nullable(),
    apiKey: z.string().optional().nullable(),
  }),
})

export type StreamingTestConnectionInput = z.infer<typeof StreamingTestConnectionSchema>

// ─── Admin Spread & Charges Validators ───────────────────────────────────────

export const SaveBrokerSpreadConfigSchema = z.object({
  /// LP markup pips applied to ALL symbols unless a per-symbol override exists.
  /// This is the global fallback. Value must be >= 0.
  globalMarkupPips: z
    .number({ invalid_type_error: 'Global markup must be a number' })
    .min(0, 'Global markup must be >= 0')
    .max(100, 'Global markup cannot exceed 100 pips'),

  /// LP commission charged per 1 standard lot, in USD (proportional for partials).
  commissionPerLot: z
    .number({ invalid_type_error: 'Commission must be a number' })
    .min(0, 'Commission must be >= 0')
    .max(1000, 'Commission per lot cannot exceed $1,000'),

  marginCallPercent: z
    .number({ invalid_type_error: 'Margin call percent must be a number' })
    .min(0, 'Margin call must be >= 0')
    .max(500, 'Margin call cannot exceed 500%')
    .optional(),

  stopoutPercent: z
    .number({ invalid_type_error: 'Stopout percent must be a number' })
    .min(0, 'Stopout must be >= 0')
    .max(200, 'Stopout cannot exceed 200%')
    .optional(),

  /// Optional per-symbol markup overrides. Each entry overrides the global markup
  /// for that specific symbol. Omitting a symbol uses the global fallback.
  symbolOverrides: z
    .array(
      z.object({
        symbolName: z.string().min(1).max(20),
        markupPips: z
          .number({ invalid_type_error: 'Markup must be a number' })
          .min(0, 'Markup must be >= 0')
          .max(100, 'Markup cannot exceed 100 pips'),
      }),
    )
    .default([]),
})

export type SaveBrokerSpreadConfigInput = z.infer<typeof SaveBrokerSpreadConfigSchema>
