import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ClientService } from './client.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UserRole, AuthUser } from '@lp/shared-types'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CreateClientSchema, UpdateClientSchema, PaginationQuerySchema } from '@lp/validators'
import { CreateClientInput, UpdateClientInput, PaginationQueryInput } from '@lp/validators'

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Get()
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'List broker clients' })
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryInput,
  ) {
    return this.clientService.findAll(user.id, query)
  }

  @Get(':id')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Get client detail' })
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.clientService.findOne(id, user.id)
  }

  @Post()
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Register a new retail client' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateClientSchema)) dto: CreateClientInput,
  ) {
    return this.clientService.create(user.id, dto)
  }

  @Patch(':id')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Update client details' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateClientSchema)) dto: UpdateClientInput,
  ) {
    return this.clientService.update(id, user.id, dto)
  }
}
