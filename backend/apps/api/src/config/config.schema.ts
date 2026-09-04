import { z } from 'zod'

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3001),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string(),
  REDIS_PASSWORD: z.string().optional(),

  // JWT secrets — MUST be set in production, no fallback literals
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Encryption key for execution account credentials
  ENCRYPTION_KEY: z.string().optional(),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(50).default(10),

  // ── On-chain Corporate Deposit Addresses for Verification ──
  USDT_DEPOSIT_ADDRESS: z.string().default('0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
  BTC_DEPOSIT_ADDRESS: z.string().default('bc1qxy2kg3zh4qn762u30jd955u7s2u30jd955u7s2'),
  ETH_DEPOSIT_ADDRESS: z.string().default('0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
  USDC_DEPOSIT_ADDRESS: z.string().default('0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
})

export type AppConfig = z.infer<typeof configSchema>
