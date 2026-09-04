import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { PricingService } from './pricing.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UserRole, AuthUser } from '@lp/shared-types'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CreatePricingProfileSchema, UpdatePricingProfileSchema, ProfileSymbolOverrideSchema } from '@lp/validators'
import { CreatePricingProfileInput, UpdatePricingProfileInput, ProfileSymbolOverrideInput } from '@lp/validators'

@ApiTags('pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('profiles')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'List broker pricing profiles' })
  async findProfiles(@CurrentUser() user: AuthUser) {
    return this.pricingService.findProfilesByBroker(user.id)
  }

  @Post('profiles')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Create new pricing profile' })
  async createProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreatePricingProfileSchema)) dto: CreatePricingProfileInput,
  ) {
    return this.pricingService.createProfile(user.id, dto)
  }

  @Patch('profiles/:id')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Update pricing profile markups' })
  async updateProfile(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdatePricingProfileSchema)) dto: UpdatePricingProfileInput,
  ) {
    return this.pricingService.updateProfile(id, user.id, dto)
  }

  @Post('profiles/:id/symbols')
  @Roles(UserRole.BROKER)
  @ApiOperation({ summary: 'Set symbol-level pricing override' })
  async upsertOverride(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ProfileSymbolOverrideSchema)) dto: ProfileSymbolOverrideInput,
  ) {
    return this.pricingService.upsertOverride(id, user.id, dto)
  }
}
