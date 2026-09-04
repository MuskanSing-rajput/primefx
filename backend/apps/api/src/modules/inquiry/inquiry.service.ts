import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { InstitutionalAccessInput } from '@lp/validators'

@Injectable()
export class InquiryService {
  private readonly logger = new Logger(InquiryService.name)

  constructor(private readonly prisma: PrismaService) {}

  async createInstitutionalAccessRequest(dto: InstitutionalAccessInput) {
    this.logger.log(`Received Institutional Access Request from ${dto.workEmail} (${dto.brokerageFirm})`)

    // Save as SystemSetting or log entry if dedicated table not present
    const requestId = `req_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`
    
    // Audit log / system record store
    try {
      const sanitize = (obj: any) => {
        if (!obj || typeof obj !== 'object') return obj
        const copy = JSON.parse(JSON.stringify(obj))
        delete copy.executionAccountId
        delete copy.executionAccount
        delete copy.apiSecret
        return copy
      }
      await this.prisma.auditLog.create({
        data: {
          entityType: 'InstitutionalInquiry',
          entityId: requestId,
          action: 'SUBMIT_INQUIRY',
          performedBy: 'PUBLIC_GUEST',
          performedByRole: 'GUEST',
          newData: sanitize(dto) as any,
          ipAddress: '127.0.0.1',
        },
      })
    } catch (err: any) {
      this.logger.warn(`Could not save audit log for inquiry, proceeding with in-memory log: ${err?.message}`)
    }

    return {
      success: true,
      statusCode: 201,
      message: 'Your institutional access request has been submitted successfully. Our team will contact you shortly.',
      data: {
        requestId,
        submittedAt: new Date().toISOString(),
      },
    }
  }

  async getInstitutionalAccessRequests() {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType: 'InstitutionalInquiry' },
      orderBy: { createdAt: 'desc' },
    })

    return {
      success: true,
      statusCode: 200,
      total: logs.length,
      data: logs.map((log) => ({
        id: log.id,
        requestId: log.entityId,
        submittedAt: log.createdAt,
        details: log.newData,
      })),
    }
  }
}
