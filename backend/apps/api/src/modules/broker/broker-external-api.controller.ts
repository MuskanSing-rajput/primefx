import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { JwtService } from '@nestjs/jwt'
import * as argon2 from 'argon2'
import { PrismaService } from '../../database/prisma.service'
import { ApiKeyGuard } from '../../common/guards/api-key.guard'
import { CurrentBroker, BrokerApiContext } from '../../common/decorators/current-broker.decorator'
import { TradingService } from '../trading/trading.service'
import { ClientService } from '../client/client.service'
import { SymbolService } from '../symbol/symbol.service'
import { PricingService } from '../pricing/pricing.service'
import { ReportingService } from '../reporting/reporting.service'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import {
  PlaceOrderSchema,
  CreateClientSchema,
  PaginationQuerySchema,
  CreatePricingProfileSchema,
  UpdatePricingProfileSchema,
  ProfileSymbolOverrideSchema,
} from '@lp/validators'
import {
  PlaceOrderInput,
  CreateClientInput,
  PaginationQueryInput,
  CreatePricingProfileInput,
  UpdatePricingProfileInput,
  ProfileSymbolOverrideInput,
} from '@lp/validators'
import { PositionStatus } from '@lp/shared-types'

/**
 * BrokerExternalApiController
 *
 * This is the DEDICATED REST API gateway for broker system integrations.
 * All routes here authenticate via API Key (x-api-key header or Authorization: ApiKey <key>).
 *
 * Brokers connect their CRM, trading platform, or back-office using this API.
 * They NEVER communicate with the execution infrastructure directly.
 * This controller is the ONLY trading gateway for all broker systems.
 *
 * Auth: x-api-key header OR Authorization: ApiKey <key>
 * Base Path: /api/v1/ext  (external — machine-to-machine)
 */
@ApiTags('Broker External API (API Key Auth)')
@ApiSecurity('ApiKey')
@UseGuards(ApiKeyGuard)
@Controller('ext')
export class BrokerExternalApiController {
  constructor(
    private readonly tradingService: TradingService,
    private readonly clientService: ClientService,
    private readonly symbolService: SymbolService,
    private readonly pricingService: PricingService,
    private readonly reportingService: ReportingService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ─── Token Exchange ────────────────────────────────────────────────────────

  @Post('auth/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange API Key + Secret for a Bearer Access Token' })
  @ApiResponse({ status: 200, description: 'Token generated successfully' })
  @ApiResponse({ status: 401, description: 'Invalid API key or secret' })
  async exchangeToken(
    @Body() body: { apiKey: string; apiSecret: string },
  ) {
    if (!body.apiKey || !body.apiSecret) {
      throw new BadRequestException('apiKey and apiSecret are required')
    }

    const credential = await this.prisma.brokerApiCredential.findUnique({
      where: { apiKey: body.apiKey },
      include: {
        broker: true,
      },
    })

    if (!credential || !credential.isActive) {
      throw new UnauthorizedException('Invalid API Key or Secret')
    }

    if (!credential.broker.apiEnabled || credential.broker.status !== 'APPROVED') {
      throw new UnauthorizedException('Broker account is suspended or not approved')
    }

    const isValidSecret = await argon2.verify(credential.apiSecret, body.apiSecret)
    if (!isValidSecret) {
      throw new UnauthorizedException('Invalid API Key or Secret')
    }

    // Token expires in 1 hour
    const token = this.jwtService.sign(
      {
        sub: credential.brokerId,
        credentialId: credential.id,
        companyName: credential.broker.companyName,
        permissions: credential.permissions,
        type: 'external',
      },
      {
        expiresIn: '1h',
      },
    )

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: 3600,
    }
  }

  // ─── System ────────────────────────────────────────────────────────────────

  @Get('ping')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify API key validity and broker status' })
  @ApiResponse({ status: 200, description: 'Authenticated successfully' })
  ping(@CurrentBroker() broker: BrokerApiContext) {
    return {
      success: true,
      message: 'API key is valid',
      broker: {
        id: broker.id,
        name: broker.companyName,
        permissions: broker.permissions,
        wallet: broker.wallet
          ? {
              availableCreditUSD: broker.wallet.availableCreditUSD,
              totalCreditUSD: broker.wallet.totalCreditUSD,
              usedCreditUSD: broker.wallet.usedCreditUSD,
            }
          : null,
      },
      timestamp: new Date().toISOString(),
    }
  }

  // ─── Symbols ───────────────────────────────────────────────────────────────

  @Get('symbols')
  @ApiOperation({
    summary: 'List all trading instruments available to this broker',
    description: 'Returns all active symbols with spread, digits, contract size information.',
  })
  async getSymbols(@CurrentBroker() _broker: BrokerApiContext) {
    this.requirePermission(_broker, 'read')
    return this.symbolService.findAll(undefined, true)
  }

  // ─── Clients ───────────────────────────────────────────────────────────────

  @Get('clients')
  @ApiOperation({
    summary: 'List broker clients',
    description: 'Paginated list of all clients registered under this broker.',
  })
  async getClients(
    @CurrentBroker() broker: BrokerApiContext,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryInput,
  ) {
    this.requirePermission(broker, 'read')
    return this.clientService.findAll(broker.id, query)
  }

  @Post('clients')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new client trading account',
    description:
      'Creates a new client under this broker. The externalClientId should match your CRM/MT5 account ID.',
  })
  @ApiResponse({ status: 201, description: 'Client created' })
  async createClient(
    @CurrentBroker() broker: BrokerApiContext,
    @Body(new ZodValidationPipe(CreateClientSchema)) dto: CreateClientInput,
  ) {
    this.requirePermission(broker, 'clients')
    return this.clientService.create(broker.id, dto)
  }

  @Get('clients/:id')
  @ApiOperation({ summary: 'Get client details by ID' })
  async getClient(@CurrentBroker() broker: BrokerApiContext, @Param('id') id: string) {
    this.requirePermission(broker, 'read')
    return this.clientService.findOne(id, broker.id)
  }

  // ─── Orders ────────────────────────────────────────────────────────────────

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Place a trading order',
    description:
      'Submit a BUY or SELL order for a client. The LP platform executes and returns fill price.',
  })
  @ApiResponse({ status: 201, description: 'Order placed and filled' })
  @ApiResponse({ status: 400, description: 'Insufficient credit, inactive symbol, or invalid client' })
  async placeOrder(
    @CurrentBroker() broker: BrokerApiContext,
    @Body(new ZodValidationPipe(PlaceOrderSchema)) dto: PlaceOrderInput,
  ) {
    this.requirePermission(broker, 'trade')
    return this.tradingService.placeOrder(broker.id, dto)
  }

  @Get('orders')
  @ApiOperation({ summary: 'List broker order history' })
  async getOrders(
    @CurrentBroker() broker: BrokerApiContext,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryInput,
  ) {
    this.requirePermission(broker, 'read')
    return this.tradingService.getOrders(broker.id, query)
  }

  // ─── Positions ─────────────────────────────────────────────────────────────

  @Get('positions')
  @ApiOperation({
    summary: 'List all positions',
    description: 'Returns open or closed positions. Filter by ?status=OPEN or ?status=CLOSED',
  })
  async getPositions(
    @CurrentBroker() broker: BrokerApiContext,
    @Query('status') status?: PositionStatus,
  ) {
    this.requirePermission(broker, 'read')
    return this.tradingService.getPositions(broker.id, status)
  }

  @Get('positions/:id')
  @ApiOperation({
    summary: 'Get position details by ID or external ticket reference',
  })
  async getPosition(@CurrentBroker() broker: BrokerApiContext, @Param('id') id: string) {
    this.requirePermission(broker, 'read')
    const position = await this.prisma.position.findFirst({
      where: {
        brokerId: broker.id,
        OR: [{ id }, { externalId: id }],
      },
      include: {
        symbol: { select: { name: true, displayName: true, digits: true } },
        client: { select: { firstName: true, lastName: true } },
      },
    })
    if (!position) {
      throw new BadRequestException(`Position ${id} not found`)
    }
    return position
  }

  @Delete('positions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close an open position at market price',
    description: 'Closes the position at current market bid/ask by LP Position ID or external ticket ID. Returns final realized PnL.',
  })
  @ApiResponse({ status: 200, description: 'Position closed' })
  @ApiResponse({ status: 404, description: 'Position not found or already closed' })
  async closePosition(@CurrentBroker() broker: BrokerApiContext, @Param('id') id: string) {
    this.requirePermission(broker, 'trade')
    return this.tradingService.closePosition(id, broker.id)
  }

  @Post('positions/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close an open position (POST alias)',
    description: 'Alternative POST route to close an open position by LP Position ID or external ticket ID.',
  })
  async closePositionPost(@CurrentBroker() broker: BrokerApiContext, @Param('id') id: string) {
    this.requirePermission(broker, 'trade')
    return this.tradingService.closePosition(id, broker.id)
  }

  // ─── Wallet ─────────────────────────────────────────────────────────────────

  @Get('wallet')
  @ApiOperation({
    summary: 'Get broker wallet and credit summary',
    description:
      'Returns wallet balance, credit limits, used credit, and available trading credit.',
  })
  async getWallet(@CurrentBroker() broker: BrokerApiContext) {
    this.requirePermission(broker, 'read')
    return {
      success: true,
      data: broker.wallet ?? {
        availableCreditUSD: '0.00',
        totalCreditUSD: '0.00',
        usedCreditUSD: '0.00',
      },
    }
  }

  // ─── Pricing Profiles ──────────────────────────────────────────────────────

  @Get('pricing/profiles')
  @ApiOperation({
    summary: 'List broker pricing profiles',
    description: 'Returns all pricing profiles configured by the broker.',
  })
  async getProfiles(@CurrentBroker() broker: BrokerApiContext) {
    this.requirePermission(broker, 'pricing')
    return this.pricingService.findProfilesByBroker(broker.id)
  }

  @Post('pricing/profiles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new pricing profile',
    description: 'Configure custom spread, commission, and swap markups.',
  })
  async createProfile(
    @CurrentBroker() broker: BrokerApiContext,
    @Body(new ZodValidationPipe(CreatePricingProfileSchema)) dto: CreatePricingProfileInput,
  ) {
    this.requirePermission(broker, 'pricing')
    return this.pricingService.createProfile(broker.id, dto)
  }

  @Patch('pricing/profiles/:id')
  @ApiOperation({
    summary: 'Update pricing profile markups',
    description: 'Modify markups on an existing pricing profile.',
  })
  async updateProfile(
    @Param('id') id: string,
    @CurrentBroker() broker: BrokerApiContext,
    @Body(new ZodValidationPipe(UpdatePricingProfileSchema)) dto: UpdatePricingProfileInput,
  ) {
    this.requirePermission(broker, 'pricing')
    return this.pricingService.updateProfile(id, broker.id, dto)
  }

  @Post('pricing/profiles/:id/symbols')
  @ApiOperation({
    summary: 'Set symbol-level pricing override',
    description: 'Set symbol-specific markups and overrides for a given pricing profile.',
  })
  async upsertOverride(
    @Param('id') id: string,
    @CurrentBroker() broker: BrokerApiContext,
    @Body(new ZodValidationPipe(ProfileSymbolOverrideSchema)) dto: ProfileSymbolOverrideInput,
  ) {
    this.requirePermission(broker, 'pricing')
    return this.pricingService.upsertOverride(id, broker.id, dto)
  }

  // ─── Reports & Analytics ───────────────────────────────────────────────────

  @Get('reports/revenue')
  @ApiOperation({
    summary: 'Get Cost + Markup revenue report',
    description: 'Detailed analysis of LP Platform raw spread/commission costs vs broker markup revenue split.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO start date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO end date' })
  async getRevenueReport(
    @CurrentBroker() broker: BrokerApiContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.requirePermission(broker, 'reports')
    return this.reportingService.getRevenueReport(
      broker.id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    )
  }

  @Get('reports/pricing-effectiveness')
  @ApiOperation({
    summary: 'Pricing profile effectiveness report',
    description: 'Returns stats on how much revenue is generated by each pricing profile.',
  })
  async getPricingEffectiveness(@CurrentBroker() broker: BrokerApiContext) {
    this.requirePermission(broker, 'reports')
    return this.reportingService.getPricingProfileReport(broker.id)
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private requirePermission(broker: BrokerApiContext, permission: string) {
    if (!broker.permissions.includes(permission) && !broker.permissions.includes('*')) {
      throw new BadRequestException(
        `API key does not have '${permission}' permission. Update your API key settings.`,
      )
    }
  }
}
