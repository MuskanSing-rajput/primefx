import { Controller, Get, Post, Query, UseGuards, Patch, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminService } from './admin.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole, AuthUser } from '@lp/shared-types'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import {
  PaginationQuerySchema,
  PaginationQueryInput,
  ConnectMt5Schema,
  ConnectMt5Input,
  StreamingConfigSchema,
  StreamingConfigInput,
  StreamingTestConnectionSchema,
  StreamingTestConnectionInput,
  SaveBrokerSpreadConfigSchema,
  SaveBrokerSpreadConfigInput,
} from '@lp/validators'

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get SuperAdmin dashboard metrics' })
  async getMetrics() {
    return this.adminService.getDashboardMetrics()
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get system audit logs' })
  async getAuditLogs(@Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryInput) {
    return this.adminService.getAuditLogs(query)
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get all system settings' })
  async getSettings() {
    return this.adminService.getSettings()
  }

  @Patch('settings/:key')
  @ApiOperation({ summary: 'Update system setting value' })
  async updateSetting(
    @Param('key') key: string,
    @Body() body: { value: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.adminService.updateSetting(key, body.value, user.id)
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get all system transaction logs' })
  async getTransactions(@Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryInput) {
    return this.adminService.getAllTransactions(query)
  }

  @Get('clients')
  @ApiOperation({ summary: 'Get all broker clients across the platform' })
  async getClients(@Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryInput) {
    return this.adminService.getAllClients(query)
  }

  @Get('pricing/limits')
  @ApiOperation({ summary: 'Get system base pricing limits and settings' })
  async getPricingLimits() {
    return this.adminService.getPricingLimits()
  }

  @Get('risk')
  @ApiOperation({ summary: 'Get platform net risk and broker margin call metrics' })
  async getRiskMonitor() {
    return this.adminService.getRiskMonitor()
  }

  @Get('clients/:id')
  @ApiOperation({ summary: 'Get full broker client detail' })
  async getClient(@Param('id') id: string) {
    return this.adminService.getClientDetail(id)
  }

  @Post('brokers/:id/connect-mt5')
  @ApiOperation({ summary: 'Connect and provision MT5 account for a broker via MetaAPI' })
  async connectMt5(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConnectMt5Schema)) dto: ConnectMt5Input,
  ) {
    return this.adminService.connectMt5(id, dto)
  }

  @Post('brokers/:id/disconnect-mt5')
  @ApiOperation({ summary: 'Disconnect and delete MT5 MetaAPI account for a broker' })
  async disconnectMt5(@Param('id') id: string) {
    return this.adminService.disconnectMt5(id)
  }

  @Get('streaming/config')
  @ApiOperation({ summary: 'Get live pricing data streaming configuration' })
  async getStreamingConfig() {
    return this.adminService.getStreamingConfig()
  }

  @Post('streaming/config')
  @ApiOperation({ summary: 'Save live pricing data streaming configuration' })
  async saveStreamingConfig(
    @Body(new ZodValidationPipe(StreamingConfigSchema)) dto: StreamingConfigInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adminService.saveStreamingConfig(dto, user.id)
  }

  @Post('streaming/test-connection')
  @ApiOperation({ summary: 'Test price feed streaming provider connection status' })
  async testStreamingConnection(
    @Body(new ZodValidationPipe(StreamingTestConnectionSchema)) dto: StreamingTestConnectionInput,
  ) {
    return this.adminService.testStreamingConnection(dto)
  }

  // ─── Spread & Charges ────────────────────────────────────────────────────

  @Get('spread-charges/brokers')
  @ApiOperation({ summary: 'List all approved brokers for the spread & charges dropdown' })
  async getApprovedBrokers() {
    return this.adminService.getApprovedBrokers()
  }

  @Get('spread-charges/:brokerId/spread')
  @ApiOperation({ summary: 'Get LP spread markup config + live raw prices for a broker' })
  async getBrokerSpreadConfig(@Param('brokerId') brokerId: string) {
    return this.adminService.getBrokerSpreadConfig(brokerId)
  }

  @Post('spread-charges/:brokerId/spread')
  @ApiOperation({ summary: 'Save LP spread markup config and hot-reload broker price stream' })
  async saveBrokerSpreadConfig(
    @Param('brokerId') brokerId: string,
    @Body(new ZodValidationPipe(SaveBrokerSpreadConfigSchema)) dto: SaveBrokerSpreadConfigInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adminService.saveBrokerSpreadConfig(brokerId, dto)
  }

  @Get('spread-charges/:brokerId/charges')
  @ApiOperation({ summary: 'Get commission rate + total LP revenue earned from a broker' })
  async getBrokerCharges(@Param('brokerId') brokerId: string) {
    return this.adminService.getBrokerCharges(brokerId)
  }

  @Post('spread-charges/:brokerId/charges')
  @ApiOperation({ summary: 'Update LP commission rate + free lot threshold for a broker' })
  async saveBrokerCommissionRate(
    @Param('brokerId') brokerId: string,
    @Body() body: { commissionPerLot?: number; freeLotsThreshold?: number },
  ) {
    return this.adminService.saveBrokerCommissionRate(brokerId, body.commissionPerLot, body.freeLotsThreshold)
  }

  // ─── Global Positions & Trade Management ──────────────────────────────────

  @Get('positions')
  @ApiOperation({ summary: 'Get all trades/positions across all brokers and clients' })
  async getPositions(
    @Query('status') status?: string,
    @Query('brokerId') brokerId?: string,
    @Query('symbolId') symbolId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAllPositions({
      status,
      brokerId,
      symbolId,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    })
  }

  @Post('positions/:id/close')
  @ApiOperation({ summary: 'Manually close an open position as Super Admin' })
  async closePosition(@Param('id') id: string) {
    return this.adminService.closePosition(id)
  }
}
