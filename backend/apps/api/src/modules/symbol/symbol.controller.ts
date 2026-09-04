import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { SymbolService } from './symbol.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole, SymbolCategory } from '@lp/shared-types'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CreateSymbolSchema, UpdateSymbolSchema } from '@lp/validators'
import { CreateSymbolInput, UpdateSymbolInput } from '@lp/validators'

import { PriceFeedService } from '../notification/price-feed.service'

@ApiTags('symbols')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('symbols')
export class SymbolController {
  constructor(
    private readonly symbolService: SymbolService,
    private readonly priceFeedService: PriceFeedService,
  ) {}

  @Get('prices')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BROKER)
  @ApiOperation({ summary: 'Get live symbol prices' })
  async getPrices() {
    return this.priceFeedService.getPrices()
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BROKER)
  @ApiOperation({ summary: 'List trading symbols' })
  async findAll(
    @Query('category') category?: SymbolCategory,
    @Query('activeOnly') activeOnly?: boolean,
  ) {
    return this.symbolService.findAll(category, activeOnly ?? true)
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BROKER)
  @ApiOperation({ summary: 'Get trading symbol detail' })
  async findOne(@Param('id') id: string) {
    return this.symbolService.findOne(id)
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create new trading symbol (SuperAdmin only)' })
  async create(@Body(new ZodValidationPipe(CreateSymbolSchema)) dto: CreateSymbolInput) {
    return this.symbolService.create(dto)
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update trading symbol (SuperAdmin only)' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSymbolSchema)) dto: UpdateSymbolInput,
  ) {
    return this.symbolService.update(id, dto)
  }

  @Patch(':id/toggle')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Toggle symbol active status (SuperAdmin only)' })
  async toggleActive(@Param('id') id: string) {
    return this.symbolService.toggleActive(id)
  }
}
