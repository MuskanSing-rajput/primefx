import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { AuthTokenPayload, AuthUser, UserRole } from '@lp/shared-types'
import { PrismaService } from '../../database/prisma.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET') ?? 'dev-secret-change-in-production'
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => {
          const token = request?.cookies?.['__Host-access_token'] ?? request?.cookies?.['access_token']
          return token ?? ExtractJwt.fromAuthHeaderAsBearerToken()(request)
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
    })
  }

  async validate(payload: AuthTokenPayload): Promise<AuthUser> {
    if (!payload.sub || !payload.role) {
      throw new UnauthorizedException('Invalid token payload')
    }


    if (payload.role === 'super_admin') {
      const admin = await this.prisma.superAdmin.findUnique({
        where: { id: payload.sub },
      })
      if (!admin || !admin.isActive) {
        throw new UnauthorizedException('Account disabled or invalid')
      }
      return { id: admin.id, email: admin.email, role: UserRole.SUPER_ADMIN }
    }

    if (payload.role === 'broker') {
      const broker = await this.prisma.broker.findUnique({
        where: { id: payload.sub },
      })
      if (!broker || broker.status === 'SUSPENDED' || broker.status === 'REJECTED') {
        throw new UnauthorizedException('Broker account inactive or suspended')
      }
      return { id: broker.id, email: broker.email, role: UserRole.BROKER }
    }

    throw new UnauthorizedException('Unknown role')
  }
}
