import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser, _info: unknown, _context: ExecutionContext): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required')
    }
    return user
  }
}
