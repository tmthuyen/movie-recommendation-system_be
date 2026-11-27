import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

type ErrorLike = { code?: unknown; message?: unknown } | null | undefined;
type InfoLike = { message?: unknown } | null | undefined;

/**
 * /auth/google: khởi tạo OAuth và chuyển hướng sang Google.
 * /auth/google/callback: Passport xử lý code, guard này đánh dấu lỗi OAuth
 * để controller redirect về FE kèm `reason` thay vì trả JSON 401.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const req = context.switchToHttp().getRequest<Request>();
      const error = err as ErrorLike;
      const passportInfo = info as InfoLike;

      const queryError =
        typeof req.query?.error === 'string' ? req.query.error : '';
      const errorCode = typeof error?.code === 'string' ? error.code : '';
      const errorMessage =
        typeof error?.message === 'string' ? error.message : '';
      const infoMessage =
        typeof passportInfo?.message === 'string' ? passportInfo.message : '';
      const raw = queryError || errorCode || errorMessage || infoMessage;

      let reason = 'google-login-failed';
      if (raw === 'access_denied') reason = 'google-access-denied';
      else if (raw.includes('GOOGLE_PROFILE_NO_EMAIL'))
        reason = 'google-profile-no-email';
      else if (raw.includes('khác')) reason = 'google-provider-conflict';

      return { __googleError: reason } as unknown as TUser;
    }

    return super.handleRequest(err, user, info, context);
  }
}
