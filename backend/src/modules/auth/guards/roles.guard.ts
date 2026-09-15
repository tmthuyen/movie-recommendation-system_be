import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  // Guard có thể chạy bất đồng bộ (async/await)
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // console.log('Request header:', req.headers);

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = req;

    if (!user || !user.scopes) {
      throw new UnauthorizedException('Not login');
    }

    const scopes = user.scopes as string[];

    const hasRole = requiredRoles.some(scope =>
      scopes.includes(scope.toUpperCase()),
    );

    if (!hasRole) {
      throw new ForbiddenException('Khong co quyen truy cap');
    }

    return true;
  }
}
