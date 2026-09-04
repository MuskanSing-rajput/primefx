import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { ReportingService } from './reporting.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UserRole, AuthUser } from '@lp/shared-types'

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('trades')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BROKER)
  @ApiOperation({ summary: 'Get trade execution report with full pricing breakdown' })
  async getTrades(@CurrentUser() user: AuthUser) {
    const brokerId = user.role === UserRole.BROKER ? user.id : undefined
    return this.reportingService.getTradeReport(brokerId)
  }

  @Get('pnl')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BROKER)
  @ApiOperation({ summary: 'Get net PnL summary (closed + floating, minus commission & swap)' })
  async getPnL(@CurrentUser() user: AuthUser) {
    const brokerId = user.role === UserRole.BROKER ? user.id : undefined
    return this.reportingService.getPnLReport(brokerId)
  }

  @Get('revenue')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BROKER)
  @ApiOperation({
    summary: 'Cost + Markup revenue model report',
    description:
      'Shows LP platform revenue vs broker revenue split. ' +
      'LP earns raw commission; broker earns markup. No rebates are paid.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — start of period' })
  @ApiQuery({ name: 'to',   required: false, description: 'ISO date — end of period' })
  async getRevenue(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const brokerId = user.role === UserRole.BROKER ? user.id : undefined
    return this.reportingService.getRevenueReport(
      brokerId,
      from ? new Date(from) : undefined,
      to   ? new Date(to)   : undefined,
    )
  }

  @Get('pricing-effectiveness')
  @Roles(UserRole.BROKER)
  @ApiOperation({
    summary: 'Pricing profile effectiveness report',
    description:
      'Shows which pricing profiles generated the most broker revenue. ' +
      'Helps brokers optimize their client pricing strategy within platform limits.',
  })
  async getPricingEffectiveness(@CurrentUser() user: AuthUser) {
    return this.reportingService.getPricingProfileReport(user.id)
  }

  @Get('threshold-status')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Get current monthly lot commission threshold status' })
  async getThresholdStatus(@CurrentUser() user: AuthUser) {
    return this.reportingService.getBrokerThresholdStatus(user.id)
  }
}
