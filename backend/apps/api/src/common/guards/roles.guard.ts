import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@lp/shared-types'
import { ROLES_KEY } from '../decorators/roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles || requiredRoles.length === 0) return true

    const request = context.switchToHttp().getRequest<{ user?: { role: UserRole } }>()
    const user = request.user

    if (!user) throw new ForbiddenException('Access denied')
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}
