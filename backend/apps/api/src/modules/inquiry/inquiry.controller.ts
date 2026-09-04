import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger'
import { InquiryService } from './inquiry.service'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { InstitutionalAccessSchema, InstitutionalAccessInput } from '@lp/validators'

@ApiTags('inquiries')
@Controller('inquiries')
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Post('institutional-access')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit institutional access request form' })
  @SwaggerResponse({ status: 201, description: 'Institutional access request submitted successfully' })
  async createInstitutionalAccess(
    @Body(new ZodValidationPipe(InstitutionalAccessSchema)) dto: InstitutionalAccessInput,
  ) {
    return this.inquiryService.createInstitutionalAccessRequest(dto)
  }

  @Get('institutional-access')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all institutional access inquiry submissions' })
  async getInstitutionalAccessRequests() {
    return this.inquiryService.getInstitutionalAccessRequests()
  }
}
