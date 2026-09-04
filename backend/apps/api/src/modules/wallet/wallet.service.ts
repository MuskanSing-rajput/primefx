import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { MailService } from '../mail/mail.service'
import { DepositRequestInput, WithdrawalRequestInput, AllocateCreditInput, PaginationQueryInput } from '@lp/validators'
import { Currency, TransactionStatus, TransactionType } from '@lp/shared-types'
import { Prisma } from '@prisma/client'
import { verifyTotp } from '../../common/utils/totp'
import { BlockchainService } from './blockchain.service'

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchain: BlockchainService,
    private readonly mailService: MailService,
  ) {}

  private getBalanceField(currency: Currency) {
    const fieldMap: Record<Currency, 'balanceUSDT' | 'balanceBTC' | 'balanceETH' | 'balanceUSDC'> = {
      USDT: 'balanceUSDT',
      BTC: 'balanceBTC',
      ETH: 'balanceETH',
      USDC: 'balanceUSDC',
    }

    return fieldMap[currency]
  }

  private async updateWalletOrThrow(
    tx: Prisma.TransactionClient,
    walletId: string,
    where: Record<string, unknown> | undefined,
    data: Record<string, unknown>,
    errorMessage: string,
  ) {
    const result = await tx.wallet.updateMany({
      where: { id: walletId, ...(where ?? {}) },
      data,
    })

    if (result.count === 0) {
      throw new BadRequestException(errorMessage)
    }
  }

  async getWalletByBrokerId(brokerId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { brokerId },
    })

    if (!wallet) throw new NotFoundException('Wallet not found for broker')

    const openPositions = await this.prisma.position.findMany({
      where: { brokerId, status: 'OPEN' },
    })

    const totalFloatingPnl = openPositions.reduce((sum, p) => sum + Number(p.floatingPnl), 0)
    const usedMargin = openPositions.reduce((sum, p) => sum + Number(p.marginReservedUSD || 0), 0)

    const pendingWithdrawals = await this.prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        status: TransactionStatus.PENDING,
        type: TransactionType.WITHDRAWAL,
      },
    })
    const totalPendingWithdrawalsUSD = pendingWithdrawals.reduce((sum, tx) => sum + Number(tx.amountUSD), 0)

    const balances = {
      USDT: Number(wallet.balanceUSDT),
      USDC: Number(wallet.balanceUSDC),
      BTC: Number(wallet.balanceBTC),
      ETH: Number(wallet.balanceETH),
    }

    const walletBalance = balances.USDT + balances.USDC + (balances.BTC * 60000) + (balances.ETH * 3000)
    const creditLimit = Number(wallet.totalCreditUSD)
    const equity = walletBalance + creditLimit + totalFloatingPnl
    const availableMargin = equity - usedMargin - totalPendingWithdrawalsUSD

    return {
      ...wallet,
      balances: {
        USDT: (Number(wallet.balanceUSDT) + Number(wallet.totalCreditUSD)).toString(),
        USDC: (Number(wallet.balanceUSDC) + Number(wallet.totalCreditUSD)).toString(),
        BTC: ((Number(wallet.balanceBTC) * 60000 + Number(wallet.totalCreditUSD)) / 60000).toString(),
        ETH: ((Number(wallet.balanceETH) * 3000 + Number(wallet.totalCreditUSD)) / 3000).toString(),
      },
      usedCreditUSD: new Prisma.Decimal(usedMargin.toFixed(8)),
      availableCreditUSD: new Prisma.Decimal(availableMargin.toFixed(8)),
    }
  }

  async getTransactions(brokerId: string, query: PaginationQueryInput) {
    const wallet = await this.getWalletByBrokerId(brokerId)
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const [data, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({
        where: { walletId: wallet.id },
      }),
    ])

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async createDeposit(brokerId: string, dto: DepositRequestInput) {
    const wallet = await this.getWalletByBrokerId(brokerId)
    const amountDec = new Prisma.Decimal(dto.amount)
    const currency = dto.currency as Currency

    // Check system setting if currency is active
    const activeSetting = await this.prisma.systemSetting.findUnique({
      where: { key: `crypto_active_${currency}` },
    })
    if (activeSetting && activeSetting.value === 'false') {
      throw new BadRequestException(`${currency} deposits are currently suspended by the administrator`)
    }

    // Ensure transaction hash is unique (prevent double-spending)
    if (dto.txHash) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: {
          txHash: dto.txHash,
          status: { in: [TransactionStatus.APPROVED, TransactionStatus.COMPLETED, TransactionStatus.PENDING] },
        },
      })
      if (existingTx) {
        throw new BadRequestException('This transaction hash has already been submitted or processed.')
      }
    }

    // 1. Production-ready on-chain verification (verifies tx existence, destination, contract, amount)
    const verification = await this.blockchain.verifyTransaction(
      dto.txHash,
      currency,
      parseFloat(dto.amount),
      (dto as any).network,
    )
    if (!verification.verified) {
      throw new BadRequestException('Deposit transaction could not be verified on-chain')
    }

    const balanceField = this.getBalanceField(currency)

    const result = await this.prisma.$transaction(async (tx) => {
      // 2. Create transaction with APPROVED status immediately (auto-credit)
      const walletTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.DEPOSIT,
          currency,
          amount: amountDec,
          amountUSD: amountDec, // 1:1 conversion
          txHash: dto.txHash,
          status: TransactionStatus.APPROVED,
          processedAt: new Date(),
          adminNote: 'On-chain verified & approved by system',
        },
      })

      // 3. Increment both the crypto asset balance and the credit balances
      await this.updateWalletOrThrow(
        tx,
        wallet.id,
        undefined,
        {
          [balanceField]: { increment: amountDec },
          totalCreditUSD: { increment: amountDec },
          availableCreditUSD: { increment: amountDec },
        },
        'Wallet deposit update failed',
      )

      return walletTx
    })

    if (result) {
      this.prisma.broker.findUnique({ where: { id: brokerId } })
        .then((broker) => {
          if (broker) {
            this.mailService.sendTransactionStatusEmail(
              broker.email,
              'DEPOSIT',
              dto.amount,
              currency,
              'APPROVED',
              'On-chain verified & approved by system'
            ).catch((err) => this.logger.error(`Failed to send deposit email: ${err.message}`))
          }
        })
    }

    return result
  }

  async createWithdrawal(brokerId: string, dto: WithdrawalRequestInput) {
    const wallet = await this.getWalletByBrokerId(brokerId)
    const amountDec = new Prisma.Decimal(dto.amount)
    const currency = dto.currency as Currency

    // Check system setting if currency is active
    const activeSetting = await this.prisma.systemSetting.findUnique({
      where: { key: `crypto_active_${currency}` },
    })
    if (activeSetting && activeSetting.value === 'false') {
      throw new BadRequestException(`${currency} withdrawals are currently suspended by the administrator`)
    }

    // 1. Verify 2FA TOTP code for secure withdrawal authorization
    const broker = await this.prisma.broker.findUnique({ where: { id: brokerId } })
    if (!broker) throw new NotFoundException('Broker not found')

    if (broker.mfaEnabled && broker.mfaSecret) {
      const is2faValid = verifyTotp(dto.totpCode, broker.mfaSecret)
      if (!is2faValid) {
        throw new BadRequestException('Invalid 2FA authorization token')
      }
    }

    // Ensure available credit is sufficient for withdrawal request
    if (new Prisma.Decimal(wallet.availableCreditUSD).lt(amountDec)) {
      throw new BadRequestException(`Insufficient available credit for withdrawal of ${amountDec} ${currency}`)
    }

    // Create transaction with PENDING status — store destination address in adminNote for admin visibility
    const walletTx = await this.prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: TransactionType.WITHDRAWAL,
        currency,
        amount: amountDec,
        amountUSD: amountDec,
        status: TransactionStatus.PENDING,
        adminNote: `DESTINATION_ADDRESS:${dto.destinationAddress}`,
      },
    })

    if (walletTx) {
      this.prisma.broker.findUnique({ where: { id: brokerId } })
        .then((broker) => {
          if (broker) {
            this.mailService.sendWithdrawalRequestEmail(
              broker.email,
              dto.amount,
              currency,
              walletTx.id
            ).catch((err) => this.logger.error(`Failed to send withdrawal request email: ${err.message}`))
          }
        })
    }

    return walletTx
  }

  async allocateCredit(adminId: string, dto: AllocateCreditInput) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { brokerId: dto.brokerId },
    })

    if (!wallet) throw new NotFoundException('Broker wallet not found')

    const amount = new Prisma.Decimal(dto.amount)

    const result = await this.prisma.$transaction(async (tx) => {
      await this.updateWalletOrThrow(
        tx,
        wallet.id,
        undefined,
        {
          totalCreditUSD: { increment: amount },
          availableCreditUSD: { increment: amount },
        },
        'Wallet credit allocation failed',
      )

      const updated = await tx.wallet.findUnique({ where: { id: wallet.id } })

      if (!updated) {
        throw new BadRequestException('Wallet credit allocation failed')
      }

      const newCredit = new Prisma.Decimal(updated.totalCreditUSD)
      const prevCredit = newCredit.minus(amount)

      await tx.creditLog.create({
        data: {
          walletId: wallet.id,
          action: 'ALLOCATE',
          amount,
          reason: dto.reason,
          previousBalance: prevCredit,
          newBalance: newCredit,
          triggeredBy: adminId,
        },
      })

      // Also log it as a WalletTransaction so it appears in both broker and admin transaction histories
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.DEPOSIT,
          currency: Currency.USDT,
          amount,
          amountUSD: amount,
          status: TransactionStatus.APPROVED,
          processedAt: new Date(),
          processedBy: adminId,
          adminNote: `Credit Allocation: ${dto.reason}`,
        },
      })

      return updated
    })

    if (result) {
      this.prisma.broker.findUnique({ where: { id: dto.brokerId } })
        .then((broker) => {
          if (broker) {
            this.mailService.sendCreditAllocationEmail(
              broker.email,
              dto.amount,
              dto.reason,
              result.totalCreditUSD.toString()
            ).catch((err) => this.logger.error(`Failed to send credit line update email: ${err.message}`))
          }
        })
    }

    return result
  }

  async approveTransaction(txId: string, adminId: string, approve: boolean, note?: string) {
    const txItem = await this.prisma.walletTransaction.findUnique({
      where: { id: txId },
      include: { wallet: true },
    })

    if (!txItem) throw new NotFoundException('Transaction not found')
    if (txItem.status !== TransactionStatus.PENDING) {
      throw new BadRequestException('Transaction is no longer pending')
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const newStatus = approve ? TransactionStatus.APPROVED : TransactionStatus.REJECTED

      const updatedTx = await tx.walletTransaction.update({
        where: { id: txId },
        data: {
          status: newStatus,
          adminNote: note ?? txItem.adminNote ?? null,
          processedBy: adminId,
          processedAt: new Date(),
        },
      })

      // If deposit approved — credit the wallet
      if (approve && txItem.type === TransactionType.DEPOSIT) {
        const currency = txItem.currency as Currency
        const balanceField = this.getBalanceField(currency)

        await this.updateWalletOrThrow(
          tx,
          txItem.walletId,
          undefined,
          {
            [balanceField]: { increment: txItem.amount },
          },
          'Approved deposit update failed',
        )
      }

      // If withdrawal approved — deduct balance (availableCreditUSD already reserved dynamically)
      if (approve && txItem.type === TransactionType.WITHDRAWAL) {
        const currency = txItem.currency as Currency
        const balanceField = this.getBalanceField(currency)

        await tx.wallet.update({
          where: { id: txItem.walletId },
          data: {
            [balanceField]: { decrement: txItem.amount },
          },
        })
      }

      return updatedTx
    })

    if (result) {
      this.prisma.wallet.findUnique({
        where: { id: result.walletId },
        include: { broker: true }
      }).then((w) => {
        if (w && w.broker) {
          this.mailService.sendTransactionStatusEmail(
            w.broker.email,
            result.type,
            result.amount.toString(),
            result.currency,
            approve ? 'APPROVED' : 'REJECTED',
            note || undefined
          ).catch((err) => this.logger.error(`Failed to send transaction approval email: ${err.message}`))
        }
      })
    }

    return result
  }

  async adminAdjust(adminId: string, dto: { brokerId: string; type: 'DEPOSIT' | 'WITHDRAWAL'; currency: Currency; amount: string; note?: string }) {
    const wallet = await this.getWalletByBrokerId(dto.brokerId)
    const amountDec = new Prisma.Decimal(dto.amount)
    const balanceField = this.getBalanceField(dto.currency)

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create transaction with APPROVED status immediately
      const walletTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: dto.type as any,
          currency: dto.currency,
          amount: amountDec,
          amountUSD: amountDec,
          status: TransactionStatus.APPROVED,
          processedAt: new Date(),
          processedBy: adminId,
          adminNote: dto.note || `Manual adjustment by admin`,
        },
      })

      // 2. Adjust wallet balances
      if (dto.type === 'DEPOSIT') {
        await this.updateWalletOrThrow(
          tx,
          wallet.id,
          undefined,
          {
            [balanceField]: { increment: amountDec },
          },
          'Admin manual deposit update failed',
        )
      } else {
        // Fetch current computed availableCreditUSD first to verify limit
        const currentWallet = await this.getWalletByBrokerId(dto.brokerId)
        if (new Prisma.Decimal(currentWallet.availableCreditUSD).lt(amountDec)) {
          throw new BadRequestException(`Insufficient available credit for manual withdrawal of ${amountDec} ${dto.currency}`)
        }

        await this.updateWalletOrThrow(
          tx,
          wallet.id,
          undefined,
          {
            [balanceField]: { decrement: amountDec },
          },
          'Admin manual withdrawal update failed',
        )
      }

      return walletTx
    })

    if (result) {
      this.prisma.broker.findUnique({ where: { id: dto.brokerId } })
        .then((broker) => {
          if (broker) {
            this.mailService.sendTransactionStatusEmail(
              broker.email,
              dto.type,
              dto.amount,
              dto.currency,
              'APPROVED',
              dto.note || 'Manual adjustment by admin'
            ).catch((err) => this.logger.error(`Failed to send adjustment email: ${err.message}`))
          }
        })
    }

    return result
  }

  async getDepositAddresses() {
    const settings = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: ['usdt_trc20_address', 'usdt_erc20_address'] },
      },
    })
    return {
      USDT_TRC20: settings.find((s) => s.key === 'usdt_trc20_address')?.value || '',
      USDT_ERC20: settings.find((s) => s.key === 'usdt_erc20_address')?.value || '',
    }
  }
}
