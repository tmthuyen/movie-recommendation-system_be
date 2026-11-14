import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC } from '@/common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    this.logger.log(
      `Handle request: err=${err}, user=${JSON.stringify(user)}, info=${info}`,
    );
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException('Chưa đăng nhập hoặc token không hợp lệ')
      );
    }

    this.logger.log(`[User ID] ${user.sub} authenticated successfully`);

    return user;
  }
}
