import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ExecutionService } from './execution.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole } from '@lp/shared-types'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CreateExecutionAccountSchema } from '@lp/validators'
import { CreateExecutionAccountInput } from '@lp/validators'

@ApiTags('execution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN) // STRICT: SuperAdmin only! Hidden from brokers
@Controller('execution-accounts')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Get()
  @ApiOperation({ summary: 'List execution accounts (SuperAdmin only)' })
  async findAll() {
    return this.executionService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get execution account detail (SuperAdmin only)' })
  async findOne(@Param('id') id: string) {
    return this.executionService.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create new execution account (SuperAdmin only)' })
  async create(@Body(new ZodValidationPipe(CreateExecutionAccountSchema)) dto: CreateExecutionAccountInput) {
    return this.executionService.create(dto)
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign execution account to broker (SuperAdmin only)' })
  async assignToBroker(@Param('id') id: string, @Body('brokerId') brokerId: string) {
    return this.executionService.assignToBroker(id, brokerId)
  }
}
