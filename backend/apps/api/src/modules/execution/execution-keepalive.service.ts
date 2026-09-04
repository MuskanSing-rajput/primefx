import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../database/prisma.service'

@Injectable()
export class ExecutionKeepAliveService {
  private readonly logger = new Logger(ExecutionKeepAliveService.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async keepMetaApiConnectionsAlive() {
    try {
      const activeAccounts = await this.prisma.executionAccount.findMany({
        where: { provider: 'metaapi', status: 'active' },
      })

      if (activeAccounts.length === 0) return

      for (const account of activeAccounts) {
        const creds = account.credentials as any
        const accountId = creds?.accountId
        const token = creds?.token

        if (!accountId || !token) continue

        // Warm up the MetaAPI cloud terminal by querying connection status
        fetch(`https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${accountId}/connection-status`, {
          headers: { 'auth-token': token },
        })
          .then((res) => {
            if (!res.ok) {
              this.logger.warn(`Keep-alive ping failed for MetaAPI account ${accountId} (Status: ${res.status})`)
            }
          })
          .catch((err) => {
            this.logger.error(`Keep-alive error for MetaAPI account ${accountId}: ${err.message}`)
          })
      }
    } catch (error: any) {
      this.logger.error(`Error in keep-alive scheduler loop: ${error.message}`)
    }
  }
}
