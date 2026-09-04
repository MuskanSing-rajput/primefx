import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../../database/prisma.service'

/**
 * ApiKeyGuard — Authenticates broker machines via JWT Bearer token or x-api-key header.
 *
 * This guard is used on REST endpoints that brokers call from their
 * CRM / back-office / trading platform systems (machine-to-machine).
 *
 * It looks for:
 *   1. Authorization: Bearer <JWT_TOKEN>  (industry standard short-lived token)
 *   2. x-api-key header                  (direct static API key)
 *   3. Authorization: ApiKey <key>       (alternative static API key)
 *
 * On success it attaches req.broker = { id, companyName, apiCredentialId, permissions, wallet }
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // Skip authentication check for the token exchange endpoint
    if (request.path && (request.path.includes('/ext/auth/token') || request.path.endsWith('/auth/token'))) {
      return true
    }

    // 1. Try JWT Bearer Token Auth first
    const authHeader = request.headers['authorization']
    if (authHeader && typeof authHeader === 'string') {
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i)
      if (tokenMatch) {
        const token = tokenMatch[1].trim()
        try {
          const payload = this.jwtService.verify(token)
          if (payload && payload.type === 'external') {
            const broker = await this.prisma.broker.findUnique({
              where: { id: payload.sub },
              include: {
                wallet: {
                  select: {
                    availableCreditUSD: true,
                    totalCreditUSD: true,
                    usedCreditUSD: true,
                  },
                },
              },
            })

            if (!broker) {
              throw new UnauthorizedException('Broker not found.')
            }
            if (!broker.apiEnabled) {
              throw new UnauthorizedException('API access is disabled for this broker account.')
            }
            if (broker.status !== 'APPROVED') {
              throw new UnauthorizedException(`Broker account status is ${broker.status}.`)
            }

            request.broker = {
              id: broker.id,
              companyName: broker.companyName,
              apiCredentialId: payload.credentialId,
              permissions: payload.permissions,
              wallet: broker.wallet,
            }

            return true
          }
        } catch (err) {
          throw new UnauthorizedException('Invalid or expired token.')
        }
      }
    }

    // 2. Fall back to static API Key Auth
    const apiKey = this.extractApiKey(request)
    if (!apiKey) {
      throw new UnauthorizedException(
        'Missing authentication. Provide Authorization: Bearer <token> or x-api-key header.',
      )
    }

    const credential = await this.prisma.brokerApiCredential.findUnique({
      where: { apiKey },
      include: {
        broker: {
          select: {
            id: true,
            companyName: true,
            status: true,
            apiEnabled: true,
            wallet: {
              select: {
                availableCreditUSD: true,
                totalCreditUSD: true,
                usedCreditUSD: true,
              },
            },
          },
        },
      },
    })

    if (!credential) {
      throw new UnauthorizedException('Invalid API key.')
    }

    if (!credential.isActive) {
      throw new UnauthorizedException('API key has been revoked.')
    }

    if (credential.expiresAt && credential.expiresAt < new Date()) {
      throw new UnauthorizedException('API key has expired.')
    }

    if (!credential.broker.apiEnabled) {
      throw new UnauthorizedException('API access is disabled for this broker account.')
    }

    if (credential.broker.status !== 'APPROVED') {
      throw new UnauthorizedException(
        `Broker account is ${credential.broker.status.toLowerCase()}. API access requires APPROVED status.`,
      )
    }

    // IP Whitelist enforcement (if configured)
    if (credential.ipWhitelist && credential.ipWhitelist.length > 0) {
      const clientIp =
        request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        request.socket?.remoteAddress ||
        '0.0.0.0'

      if (!credential.ipWhitelist.includes(clientIp)) {
        throw new UnauthorizedException(
          `IP address ${clientIp} is not whitelisted for this API key.`,
        )
      }
    }

    // Update lastUsedAt asynchronously
    this.prisma.brokerApiCredential
      .update({
        where: { id: credential.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {})

    // Attach authenticated broker context to request
    request.broker = {
      id: credential.broker.id,
      companyName: credential.broker.companyName,
      apiCredentialId: credential.id,
      permissions: credential.permissions,
      wallet: credential.broker.wallet,
    }

    return true
  }

  private extractApiKey(request: any): string | null {
    // 1. x-api-key header (preferred)
    const headerKey = request.headers['x-api-key']
    if (headerKey && typeof headerKey === 'string') return headerKey.trim()

    // 2. Authorization: ApiKey <key>
    const authHeader = request.headers['authorization']
    if (authHeader && typeof authHeader === 'string') {
      const match = authHeader.match(/^ApiKey\s+(.+)$/i)
      if (match) return match[1].trim()
    }

    // 3. Query param (discouraged)
    const queryKey = request.query?.api_key
    if (queryKey && typeof queryKey === 'string') return queryKey.trim()

    return null
  }
}
