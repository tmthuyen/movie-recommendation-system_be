import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard này có hai nhiệm vụ tùy endpoint:

/auth/google: khởi tạo OAuth và chuyển hướng người dùng sang Google.

/auth/google/callback: nhận callback và để Passport xử lý authorization code
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
