import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UserRole, AuthUser } from '@lp/shared-types'
import { SupportService, CreateTicketDto, AddMessageDto } from './support.service'

@ApiTags('Broker Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('broker/support')
export class BrokerSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Raise a new support ticket as Broker' })
  async createTicket(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTicketDto,
  ) {
    return this.supportService.createTicket(user.id, dto)
  }

  @Get('tickets')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Get all support tickets for the logged-in Broker' })
  async getTickets(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.supportService.getBrokerTickets(user.id, status)
  }

  @Get('tickets/:id')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Get ticket details and full message thread' })
  async getTicketDetails(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.supportService.getBrokerTicketDetails(user.id, id)
  }

  @Post('tickets/:id/messages')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Add a reply message to a support ticket' })
  async addMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddMessageDto,
  ) {
    return this.supportService.addBrokerMessage(user.id, id, dto)
  }

  @Post('tickets/:id/resolve')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Mark ticket as resolved by Broker' })
  async resolveTicket(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.supportService.resolveBrokerTicket(user.id, id)
  }

  @Post('tickets/:id/read')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Mark support ticket messages as read by Broker' })
  async markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.supportService.markBrokerTicketAsRead(user.id, id)
  }
}
