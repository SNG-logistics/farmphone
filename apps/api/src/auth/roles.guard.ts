import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import {
  AppRole,
  AuthenticatedUser,
  hasPermission,
  hasRequiredRole,
  isAppRole,
  normalizePermissions,
} from './rbac.types';
import { ROLES_KEY } from './roles.decorator';

type RequestWithUser = {
  user?: Partial<AuthenticatedUser> & { role?: unknown; permissions?: unknown };
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];

    if (requiredRoles.length === 0 && requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication is required');
    }

    if (!isAppRole(user.role)) {
      throw new ForbiddenException('User role is invalid');
    }

    if (!hasRequiredRole(user.role, requiredRoles)) {
      throw new ForbiddenException('Insufficient role');
    }

    const permissions = normalizePermissions(user.permissions);
    const hasAllPermissions = user.role === 'SUPER_ADMIN'
      || requiredPermissions.every((permission) => hasPermission(permissions, permission));

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

