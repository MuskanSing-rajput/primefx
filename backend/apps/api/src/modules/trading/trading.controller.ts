import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { TradingService } from './trading.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UserRole, PositionStatus, AuthUser } from '@lp/shared-types'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { PlaceOrderSchema, PaginationQuerySchema } from '@lp/validators'
import { PlaceOrderInput, PaginationQueryInput } from '@lp/validators'

@ApiTags('trading')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}

  @Post('orders')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Place a trade order' })
  async placeOrder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(PlaceOrderSchema)) dto: PlaceOrderInput,
  ) {
    return this.tradingService.placeOrder(user.id, dto)
  }

  @Get('orders')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'List broker order history' })
  async getOrders(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryInput,
  ) {
    return this.tradingService.getOrders(user.id, query)
  }

  @Get('positions')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'List broker open/closed positions' })
  async getPositions(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: PositionStatus,
  ) {
    return this.tradingService.getPositions(user.id, status)
  }

  @Post('positions/:id/close')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Close an open position' })
  async closePosition(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.tradingService.closePosition(id, user.id)
  }
}
