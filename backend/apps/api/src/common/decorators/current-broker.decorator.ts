import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/**
 * @CurrentBroker() — Extracts the broker context set by ApiKeyGuard.
 *
 * Usage on API key-protected endpoints:
 *   @UseGuards(ApiKeyGuard)
 *   async myEndpoint(@CurrentBroker() broker: BrokerApiContext) { ... }
 */
export const CurrentBroker = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    return request.broker
  },
)

export interface BrokerApiContext {
  id: string
  companyName: string
  apiCredentialId: string
  permissions: string[]
  wallet: {
    availableCreditUSD: string
    totalCreditUSD: string
    usedCreditUSD: string
  } | null
}
