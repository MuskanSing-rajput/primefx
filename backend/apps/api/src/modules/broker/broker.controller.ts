import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Header, Req, Res } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Request, Response } from 'express'
import { JwtService } from '@nestjs/jwt'
import { BrokerService } from './broker.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UserRole, BrokerStatus, AuthUser } from '@lp/shared-types'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { UpdateBrokerSchema, UpdateBrokerStatusSchema, PaginationQuerySchema } from '@lp/validators'
import { UpdateBrokerInput, UpdateBrokerStatusInput, PaginationQueryInput } from '@lp/validators'

@ApiTags('brokers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('brokers')
export class BrokerController {
  constructor(
    private readonly brokerService: BrokerService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('me')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Get current authenticated broker profile' })
  async getMe(@CurrentUser() user: AuthUser) {
    return this.brokerService.findOne(user.id, false)
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all brokers (SuperAdmin only)' })
  async findAll(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryInput,
    @Query('status') status?: BrokerStatus,
  ) {
    return this.brokerService.findAll(query, status)
  }

  // ─── API Credential Management ─────────────────────────────

  /**
   * POST /brokers/api-credentials/generate
   * Generates a fresh API Key + Secret pair.
   * The plaintext secret is returned ONCE — hashed before storage.
   */
  @Post('api-credentials/generate')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Generate new API Key + Secret (secret shown once only)' })
  async generateApiCredentials(@CurrentUser() user: AuthUser) {
    return this.brokerService.generateApiCredentials(user.id)
  }

  /**
   * GET /brokers/api-credentials
   * Lists all credentials for this broker. Never returns apiSecret.
   */
  @Get('api-credentials')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'List API credentials (secret never included)' })
  async listApiCredentials(@CurrentUser() user: AuthUser) {
    return this.brokerService.listApiCredentials(user.id)
  }

  /**
   * DELETE /brokers/api-credentials/:id/revoke
   * Revokes (deactivates) a specific API credential.
   */
  @Delete('api-credentials/:id/revoke')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Revoke an API credential' })
  async revokeApiCredential(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.brokerService.revokeApiCredential(user.id, id)
  }

  // ─── Algo Connect ─────────────────────────────────────────────────────────

  /**
   * GET /brokers/algo-connect
   * Returns current algo credential status + house client ID.
   */
  @Get('algo-connect')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Get current Algo Connect credential and house client' })
  async getAlgoConnect(@CurrentUser() user: AuthUser) {
    return this.brokerService.getAlgoConnect(user.id)
  }

  /**
   * POST /brokers/algo-connect/generate
   * Generate (or regenerate) a dedicated Algo Connect API key.
   * Auto-creates the house TradingClient if it doesn't exist.
   */
  @Post('algo-connect/generate')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Generate or regenerate Algo Connect API credentials' })
  async generateAlgoConnect(@CurrentUser() user: AuthUser) {
    return this.brokerService.generateAlgoConnect(user.id)
  }
  @Get('notifications')
  @Roles(UserRole.BROKER)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @ApiOperation({ summary: 'Get recent broker notifications' })
  async getNotifications(@CurrentUser() user: AuthUser) {
    return this.brokerService.getBrokerNotifications(user.id)
  }

  @Get(':id')

  @Roles(UserRole.SUPER_ADMIN, UserRole.BROKER)
  @ApiOperation({ summary: 'Get broker detail' })
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Brokers can only view their own detail
    if (user.role === UserRole.BROKER && user.id !== id) {
      return this.brokerService.findOne(user.id, false)
    }
    // If SuperAdmin, include sensitive execution account info; brokers get a restricted view
    return this.brokerService.findOne(id, user.role === UserRole.SUPER_ADMIN)
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BROKER)
  @ApiOperation({ summary: 'Update broker information' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBrokerSchema)) dto: UpdateBrokerInput,
    @CurrentUser() user: AuthUser,
  ) {
    const targetId = user.role === UserRole.BROKER ? user.id : id
    return this.brokerService.update(targetId, dto)
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve, suspend, or reject broker (SuperAdmin only)' })
  async updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBrokerStatusSchema)) dto: UpdateBrokerStatusInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.brokerService.updateStatus(id, dto, user.id)
  }

  @Patch(':id/trading-mode')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update broker trading mode (DEMO or LIVE) (SuperAdmin only)' })
  async updateTradingMode(
    @Param('id') id: string,
    @Body() body: { tradingMode: 'DEMO' | 'LIVE' },
  ) {
    return this.brokerService.updateTradingMode(id, body.tradingMode)
  }

  // ─── MFA Security Setup ───

  @Post('mfa/generate')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Generate a new TOTP 2FA secret' })
  async generateMfa(@CurrentUser() user: AuthUser) {
    return this.brokerService.generateMfa(user.id)
  }

  @Post('mfa/enable')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Verify and enable TOTP 2FA' })
  async enableMfa(
    @CurrentUser() user: AuthUser,
    @Body() body: { secret: string; totpCode: string },
  ) {
    return this.brokerService.enableMfa(user.id, body.secret, body.totpCode)
  }

  @Post('mfa/disable')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Disable TOTP 2FA' })
  async disableMfa(
    @CurrentUser() user: AuthUser,
    @Body() body: { totpCode: string },
  ) {
    return this.brokerService.disableMfa(user.id, body.totpCode)
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a broker (SuperAdmin only)' })
  async delete(@Param('id') id: string) {
    return this.brokerService.delete(id)
  }

  @Post(':id/impersonate')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Impersonate a broker (SuperAdmin only)' })
  async impersonate(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request,
  ) {
    const broker = await this.brokerService.findOne(id, false)
    const token = this.jwtService.sign({
      sub: broker.id,
      email: broker.email,
      role: UserRole.BROKER,
    })

    const isSecure = request.secure || request.headers['x-forwarded-proto'] === 'https'
    const isProduction = process.env.NODE_ENV === 'production'
    const useSecureCookie = !!(isSecure || isProduction)
    const cookieName = useSecureCookie ? '__Host-access_token' : 'access_token'

    // Get current admin token to backup
    const adminToken = request.cookies?.[cookieName] || request.cookies?.['access_token'] || request.cookies?.['__Host-access_token']
    if (adminToken) {
      response.cookie('admin_access_token', adminToken, {
        httpOnly: true,
        secure: useSecureCookie,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 1000, // 1 hour
      })
    }

    // Set non-httpOnly cookie for client UI state
    response.cookie('is_impersonating', 'true', {
      secure: useSecureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: 20 * 60 * 1000,
    })

    response.cookie(cookieName, token, {
      httpOnly: true,
      secure: useSecureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: 20 * 60 * 1000, // 20 minutes
    })

    if (useSecureCookie) {
      response.clearCookie('access_token', { path: '/' })
    } else {
      response.clearCookie('__Host-access_token', { path: '/', secure: true, httpOnly: true })
    }

    return { success: true }
  }

}
