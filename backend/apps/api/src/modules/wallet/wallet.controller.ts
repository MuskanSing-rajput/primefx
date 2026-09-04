import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { WalletService } from './wallet.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UserRole, AuthUser } from '@lp/shared-types'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { DepositRequestSchema, WithdrawalRequestSchema, AllocateCreditSchema, PaginationQuerySchema } from '@lp/validators'
import { DepositRequestInput, WithdrawalRequestInput, AllocateCreditInput, PaginationQueryInput } from '@lp/validators'

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Get current broker wallet summary' })
  async getWallet(@CurrentUser() user: AuthUser) {
    return this.walletService.getWalletByBrokerId(user.id)
  }

  @Get('transactions')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Get broker transaction history' })
  async getTransactions(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryInput,
  ) {
    return this.walletService.getTransactions(user.id, query)
  }

  @Get('deposit-addresses')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Get admin deposit addresses for USDT' })
  async getDepositAddresses() {
    return this.walletService.getDepositAddresses()
  }

  @Post('deposit')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Submit deposit request' })
  async deposit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(DepositRequestSchema)) dto: DepositRequestInput,
  ) {
    return this.walletService.createDeposit(user.id, dto)
  }

  @Post('withdraw')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Submit withdrawal request' })
  async withdraw(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(WithdrawalRequestSchema)) dto: WithdrawalRequestInput,
  ) {
    return this.walletService.createWithdrawal(user.id, dto)
  }

  @Post('credit/allocate')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Allocate trading credit to broker (SuperAdmin only)' })
  async allocateCredit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(AllocateCreditSchema)) dto: AllocateCreditInput,
  ) {
    return this.walletService.allocateCredit(user.id, dto)
  }

  @Patch('transactions/:id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or reject pending transaction (SuperAdmin only)' })
  async approveTransaction(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body('approve') approve: boolean,
    @Body('note') note?: string,
  ) {
    return this.walletService.approveTransaction(id, user.id, approve, note)
  }

  @Post('admin/adjust')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin manual deposit or withdrawal adjustment' })
  async adminAdjust(
    @Body() dto: { brokerId: string; type: 'DEPOSIT' | 'WITHDRAWAL'; currency: any; amount: string; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.walletService.adminAdjust(user.id, dto)
  }
}
