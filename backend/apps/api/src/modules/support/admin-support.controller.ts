import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UserRole, AuthUser } from '@lp/shared-types'
import { SupportService, AddMessageDto, UpdateTicketDto } from './support.service'

@ApiTags('Admin Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all support tickets across all brokers for Super Admin' })
  async getAllTickets(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('brokerId') brokerId?: string,
    @Query('search') search?: string,
  ) {
    return this.supportService.getAllTickets({ status, priority, brokerId, search })
  }

  @Get('tickets/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get ticket details, broker info, and message thread' })
  async getTicketDetails(@Param('id') id: string) {
    await this.supportService.markAdminTicketAsRead(id)
    return this.supportService.getAdminTicketDetails(id)
  }

  @Post('tickets/:id/messages')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin reply to support ticket' })
  async addAdminMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddMessageDto,
  ) {
    return this.supportService.addAdminMessage(user.id, id, dto)
  }

  @Post('tickets/:id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update ticket status or priority as Super Admin' })
  async updateTicketStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.supportService.updateTicketStatus(id, dto)
  }

  @Delete('tickets/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a support ticket as Super Admin' })
  async deleteTicket(@Param('id') id: string) {
    return this.supportService.deleteTicket(id)
  }
}
