import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import * as crypto from 'crypto'
import * as argon2 from 'argon2'
import { PrismaService } from '../../database/prisma.service'
import { MailService } from '../mail/mail.service'
import { UpdateBrokerInput, UpdateBrokerStatusInput, PaginationQueryInput } from '@lp/validators'
import { BrokerStatus } from '@lp/shared-types'

@Injectable()
export class BrokerService {
  private readonly logger = new Logger(BrokerService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async findAll(query: PaginationQueryInput, statusFilter?: BrokerStatus) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(query.search
        ? {
            OR: [
              { companyName: { contains: query.search, mode: 'insensitive' as const } },
              { contactName: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [data, total] = await Promise.all([
      this.prisma.broker.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          phone: true,
          country: true,
          regulatoryLicense: true,
          businessTaxId: true,
          entityType: true,
          kycDocuments: true,
          adminNote: true,
          status: true,
          agreementAccepted: true,
          apiEnabled: true,
          executionAccountId: true,
          demoExecutionAccountId: true,
          tradingMode: true,
          executionAccount: {
            select: { id: true, accountName: true, provider: true, accountNumber: true, serverAddress: true, credentials: true }
          },
          demoExecutionAccount: {
            select: { id: true, accountName: true, provider: true, accountNumber: true, serverAddress: true, credentials: true }
          },
          createdAt: true,
          approvedAt: true,
          agreementAcceptedAt: true,
          wallet: true,
        },
      }),
      this.prisma.broker.count({ where }),
    ])

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async findOne(id: string, includeExecutionAccount = false) {
    // Explicitly select allowed fields to avoid unintentionally returning internal IDs
    const select: any = {
      id: true,
      companyName: true,
      contactName: true,
      email: true,
      phone: true,
      country: true,
      regulatoryLicense: true,
      businessTaxId: true,
      entityType: true,
      kycDocuments: true,
      adminNote: true,
      status: true,
      agreementAccepted: true,
      apiEnabled: true,
      mfaEnabled: true,
      createdAt: true,
      approvedAt: true,
      agreementAcceptedAt: true,
      wallet: true,
      tradingMode: true,
      demoExecutionAccountId: true,
      apiCredentials: {
        select: {
          id: true,
          apiKey: true,
          permissions: true,
          ipWhitelist: true,
          isActive: true,
          createdAt: true,
          expiresAt: true,
        },
      },
    }

    // Only include execution account relation for SuperAdmin callers — never include the raw executionAccountId scalar
    if (includeExecutionAccount) {
      select.executionAccount = { select: { id: true, accountName: true, provider: true, accountNumber: true, serverAddress: true, credentials: true } }
      select.demoExecutionAccount = { select: { id: true, accountName: true, provider: true, accountNumber: true, serverAddress: true, credentials: true } }
    }

    const broker = await this.prisma.broker.findUnique({ where: { id }, select })

    if (!broker) throw new NotFoundException('Broker not found')
    return broker
  }

  async update(id: string, dto: UpdateBrokerInput) {
    await this.findOne(id)
    return this.prisma.broker.update({
      where: { id },
      data: dto,
    })
  }

  async updateStatus(id: string, dto: UpdateBrokerStatusInput, adminId: string) {
    const broker = await this.findOne(id)

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.broker.update({
        where: { id },
        data: {
          status: dto.status,
          adminNote: dto.adminNote ?? null,
          ...(dto.status === 'APPROVED' ? { approvedAt: new Date(), apiEnabled: true } : {}),
          ...(dto.status === 'SUSPENDED' ? { suspendedAt: new Date() } : {}),
        },
      })

      // When approving for the first time, provision a Wallet and default MOCK Execution Account automatically
      if (dto.status === 'APPROVED') {
        if (!broker.wallet) {
          await tx.wallet.create({
            data: { brokerId: id },
          })
        }
        if (!broker.executionAccountId) {
          const execAccount = await tx.executionAccount.create({
            data: {
              accountName: `Default LP Execution Account - ${broker.companyName}`,
              provider: 'MOCK',
              accountNumber: `LP-MOCK-${id.slice(0, 8).toUpperCase()}`,
              serverAddress: 'localhost:mock',
              credentials: { mode: 'paper' },
              status: 'active',
              maxExposure: '1000000.00',
            },
          })
          await tx.broker.update({
            where: { id },
            data: { executionAccountId: execAccount.id },
          })
        }
      }

      // Log audit (sanitize sensitive fields)
      const sanitize = (obj: any) => {
        if (!obj || typeof obj !== 'object') return obj
        const copy = JSON.parse(JSON.stringify(obj))
        delete copy.executionAccountId
        delete copy.executionAccount
        delete copy.apiSecret
        return copy
      }
      await tx.auditLog.create({
        data: {
          entityType: 'Broker',
          entityId: id,
          action: `STATUS_CHANGE_${dto.status}`,
          performedBy: adminId,
          performedByRole: 'super_admin',
          previousData: sanitize({ status: broker.status }),
          newData: sanitize({ status: dto.status, note: dto.adminNote }),
          ipAddress: '127.0.0.1',
        },
      })

      return updated
    })

    // Send email notification outside transaction
    if (result && (dto.status === 'APPROVED' || dto.status === 'SUSPENDED' || dto.status === 'REJECTED')) {
      this.mailService.sendBrokerStatusEmail(
        result.email,
        result.companyName,
        dto.status,
        dto.adminNote || undefined
      ).catch((err) => {
        this.logger.error(`Failed to send broker status update email: ${err.message}`)
      })
    }

    return result
  }

  // ─── Google Authenticator 2FA Settings ───

  async generateMfa(brokerId: string) {
    const broker = await this.prisma.broker.findUnique({
      where: { id: brokerId },
      select: { email: true, companyName: true },
    })
    if (!broker) throw new NotFoundException('Broker not found')

    const { generateBase32Secret, buildOtpauthUrl } = await import('../../common/utils/totp')
    const secret = generateBase32Secret()
    const label = broker.email ?? broker.companyName ?? brokerId
    const otpauthUrl = buildOtpauthUrl(label, secret, 'LP')

    return { secret, otpauthUrl }
  }

  async enableMfa(brokerId: string, secret: string, totpCode: string) {
    const { verifyTotp } = await import('../../common/utils/totp')
    const isValid = verifyTotp(totpCode, secret)
    if (!isValid) {
      throw new BadRequestException('Invalid verification code. Could not enable 2FA.')
    }

    await this.prisma.broker.update({
      where: { id: brokerId },
      data: {
        mfaEnabled: true,
        mfaSecret: secret,
      },
    })

    return { success: true }
  }

  async disableMfa(brokerId: string, totpCode: string) {
    const broker = await this.prisma.broker.findUnique({
      where: { id: brokerId },
      select: { mfaEnabled: true, mfaSecret: true },
    })
    if (!broker || !broker.mfaEnabled || !broker.mfaSecret) {
      throw new BadRequestException('MFA is not enabled on this profile')
    }

    const { verifyTotp } = await import('../../common/utils/totp')
    const isValid = verifyTotp(totpCode, broker.mfaSecret)
    if (!isValid) {
      throw new BadRequestException('Invalid verification code. Could not disable 2FA.')
    }

    await this.prisma.broker.update({
      where: { id: brokerId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
      },
    })

    return { success: true }
  }

  // ─── API Credential Management ────────────────────────────────────────────

  /**
   * Generate a new API Key + Secret pair for a broker.
   * The raw secret is returned ONCE only — it is hashed before storage.
   * Industry standard: API Key (identifier) + API Secret (HMAC signing key).
   */
  async generateApiCredentials(brokerId: string) {
    const broker = await this.prisma.broker.findUnique({
      where: { id: brokerId },
      select: { status: true, apiEnabled: true },
    })
    if (!broker) throw new NotFoundException('Broker not found')
    if (broker.status !== 'APPROVED') {
      throw new BadRequestException('Only approved brokers can generate API credentials')
    }

    // Check if an active API key already exists for this broker
    const existingActive = await this.prisma.brokerApiCredential.findFirst({
      where: { brokerId, credentialType: 'broker', isActive: true },
    })
    if (existingActive) {
      throw new BadRequestException('An active API key already exists. Revoke it before generating a new one.')
    }

    // Generate cryptographically secure key and secret
    const rawKey    = `lp_live_${crypto.randomBytes(20).toString('hex')}`
    const rawSecret = `lp_secret_${crypto.randomBytes(32).toString('hex')}`

    // Hash the secret with argon2 (never store plaintext)
    const secretHash = await argon2.hash(rawSecret, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    })

    const credential = await this.prisma.brokerApiCredential.create({
      data: {
        brokerId,
        apiKey: rawKey,
        apiSecret: secretHash,
        permissions: ['read', 'trade', 'clients', 'pricing', 'reports'],
        isActive: true,
      },
    })

    // Return the raw secret ONLY here — it will never be retrievable again
    return {
      id: credential.id,
      apiKey: rawKey,
      apiSecret: rawSecret,   // ← shown ONCE, then gone
      permissions: credential.permissions,
      createdAt: credential.createdAt,
      warning: 'Store your API Secret securely. It will NOT be shown again.',
    }
  }

  /**
   * List all API credentials for a broker (key only, never secret).
   */
  async listApiCredentials(brokerId: string) {
    return this.prisma.brokerApiCredential.findMany({
      where: { brokerId },
      select: {
        id: true,
        apiKey: true,
        permissions: true,
        ipWhitelist: true,
        isActive: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        // apiSecret is NEVER included in list responses
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Revoke (deactivate) an API credential.
   */
  async revokeApiCredential(brokerId: string, credentialId: string) {
    const credential = await this.prisma.brokerApiCredential.findFirst({
      where: { id: credentialId, brokerId },
    })
    if (!credential) throw new NotFoundException('API credential not found')

    await this.prisma.brokerApiCredential.update({
      where: { id: credentialId },
      data: { isActive: false },
    })

    return { success: true, message: 'API credential revoked successfully' }
  }

  // ─── Algo Connect ─────────────────────────────────────────────────────────

  /**
   * Generate (or regenerate) a dedicated Algo Connect API credential.
   * Also auto-provisions a "house" TradingClient for the broker if one
   * doesn't already exist, so algo trades can be booked without a real client.
   */
  async generateAlgoConnect(brokerId: string) {
    const broker = await this.prisma.broker.findUnique({
      where: { id: brokerId },
      select: { status: true, companyName: true, email: true },
    })
    if (!broker) throw new NotFoundException('Broker not found')
    if (broker.status !== 'APPROVED') {
      throw new BadRequestException('Only approved brokers can generate Algo Connect credentials')
    }

    // Check if an active Algo Connect key already exists for this broker
    const existingAlgo = await this.prisma.brokerApiCredential.findFirst({
      where: { brokerId, credentialType: 'algo', isActive: true },
    })
    if (existingAlgo) {
      throw new BadRequestException('An active Algo Connect API key already exists. Revoke it before generating a new one.')
    }

    // Find or create the "house" algo client (internal account for broker algo trades)
    const algoEmail = broker.email
    let houseClient = await this.prisma.tradingClient.findFirst({
      where: { brokerId, externalClientId: 'ALGO_HOUSE' },
    })
    if (!houseClient) {
      houseClient = await this.prisma.tradingClient.create({
        data: {
          brokerId,
          externalClientId: 'ALGO_HOUSE',
          firstName: broker.companyName,
          lastName: 'Algo',
          email: algoEmail,
          accountType: 'algo',
          leverage: 100,
          currency: 'USD',
          isActive: true,
        },
      })
    } else {
      houseClient = await this.prisma.tradingClient.update({
        where: { id: houseClient.id },
        data: {
          firstName: broker.companyName,
          lastName: 'Algo',
          email: algoEmail,
        },
      })
    }

    // Generate cryptographically secure key and secret
    const rawKey    = `lp_algo_${crypto.randomBytes(20).toString('hex')}`
    const rawSecret = `lp_algo_secret_${crypto.randomBytes(32).toString('hex')}`

    // Hash the secret with argon2 (never store plaintext)
    const secretHash = await argon2.hash(rawSecret, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    })

    const credential = await this.prisma.brokerApiCredential.create({
      data: {
        brokerId,
        apiKey: rawKey,
        apiSecret: secretHash,
        label: 'Algo Connect',
        credentialType: 'algo',
        algoClientId: houseClient.id,
        permissions: ['read', 'trade'],
        isActive: true,
      },
    })

    return {
      id: credential.id,
      apiKey: rawKey,
      apiSecret: rawSecret,    // ← shown ONCE, then gone
      label: 'Algo Connect',
      credentialType: 'algo',
      algoClientId: houseClient.id,
      algoClientEmail: algoEmail,
      permissions: credential.permissions,
      createdAt: credential.createdAt,
      warning: 'Store your Algo Connect API Secret securely. It will NOT be shown again.',
    }
  }

  /**
   * Fetch current Algo Connect credential info (key, house client ID, status).
   * Never returns the secret hash.
   */
  async getAlgoConnect(brokerId: string) {
    const credential = await this.prisma.brokerApiCredential.findFirst({
      where: { brokerId, credentialType: 'algo', isActive: true },
      select: {
        id: true,
        apiKey: true,
        label: true,
        credentialType: true,
        algoClientId: true,
        permissions: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!credential) {
      return { connected: false, credential: null, houseClient: null }
    }

    let houseClient = null
    if (credential.algoClientId) {
      houseClient = await this.prisma.tradingClient.findUnique({
        where: { id: credential.algoClientId },
        select: { id: true, externalClientId: true, firstName: true, lastName: true, email: true, isActive: true },
      })
    }

    return {
      connected: true,
      credential,
      houseClient,
    }
  }

  async updateTradingMode(id: string, tradingMode: 'DEMO' | 'LIVE') {
    const broker = await this.findOne(id, true)
    if (tradingMode === 'LIVE' && !broker.executionAccountId) {
      throw new BadRequestException('Cannot set trading mode to LIVE: no MT5 MetaAPI account is connected to this broker.')
    }
    return this.prisma.broker.update({
      where: { id },
      data: { tradingMode },
    })
  }

  async getBrokerNotifications(brokerId: string) {
    // Pull last 20 wallet transactions via the wallet relation
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { wallet: { brokerId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const notifications = transactions.map((tx) => {
      let title = ''
      let message = ''
      const amount = `${Number(tx.amount).toFixed(2)} ${tx.currency}`

      if (tx.type === 'DEPOSIT') {
        if (tx.status === 'APPROVED' || tx.status === 'COMPLETED') {
          title = 'Deposit Approved'
          message = `Your deposit of ${amount} has been approved and credited to your account.`
        } else if (tx.status === 'REJECTED') {
          title = 'Deposit Rejected'
          message = `Your deposit of ${amount} was rejected. Please contact support.`
        } else {
          title = 'Deposit Pending'
          message = `Your deposit of ${amount} is under review.`
        }
      } else if (tx.type === 'WITHDRAWAL') {
        if (tx.status === 'APPROVED' || tx.status === 'COMPLETED') {
          title = 'Withdrawal Approved'
          message = `Your withdrawal of ${amount} has been approved and is being processed.`
        } else if (tx.status === 'REJECTED') {
          title = 'Withdrawal Rejected'
          message = `Your withdrawal of ${amount} was rejected. Please contact support.`
        } else {
          title = 'Withdrawal Requested'
          message = `Your withdrawal request of ${amount} has been submitted and is pending admin review.`
        }
      } else {
        title = 'Account Transaction'
        message = `Transaction of ${amount} (${tx.type}) — ${tx.status}`
      }

      return {
        id: tx.id,
        type: tx.type,
        title,
        message,
        createdAt: tx.createdAt.toISOString(),
        read: false, // Managed dynamically on frontend using last_read_notifs_at timestamp
      }
    })

    // Pull recent support ticket notifications
    const supportTickets = await this.prisma.supportTicket.findMany({
      where: { brokerId },
      orderBy: { lastMessageAt: 'desc' },
      take: 15,
    })

    const supportNotifs = supportTickets.map((t) => ({
      id: `support_${t.id}`,
      type: 'SUPPORT',
      title: t.hasUnreadAdminReply ? 'New Support Ticket Reply' : 'Support Ticket',
      message: t.hasUnreadAdminReply
        ? `New reply from Super Admin Support on ticket: ${t.subject} (${t.ticketNumber})`
        : `Support ticket update on: ${t.subject} (${t.ticketNumber})`,
      createdAt: t.lastMessageAt.toISOString(),
      read: !t.hasUnreadAdminReply,
    }))

    const merged = [...supportNotifs, ...notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return merged
  }

  async delete(id: string) {
    const broker = await this.prisma.broker.findUnique({
      where: { id },
      include: {
        wallet: true,
      },
    })

    if (!broker) throw new NotFoundException('Broker not found')

    await this.prisma.$transaction(async (tx) => {
      // 1. Delete AuditLog records where performedBy equals this broker ID
      await tx.auditLog.deleteMany({
        where: { performedBy: id },
      })

      // 2. Delete WalletTransactions and CreditLogs associated with the broker's wallet
      if (broker.wallet) {
        await tx.walletTransaction.deleteMany({
          where: { walletId: broker.wallet.id },
        })
        await tx.creditLog.deleteMany({
          where: { walletId: broker.wallet.id },
        })
        // Delete Wallet
        await tx.wallet.delete({
          where: { id: broker.wallet.id },
        })
      }

      // 3. Delete Positions and Orders
      await tx.position.deleteMany({
        where: { brokerId: id },
      })
      await tx.order.deleteMany({
        where: { brokerId: id },
      })

      // 4. Delete Trading Clients
      await tx.tradingClient.deleteMany({
        where: { brokerId: id },
      })

      // 5. Delete the broker itself
      await tx.broker.delete({
        where: { id },
      })
    })

    return { success: true }
  }
}

