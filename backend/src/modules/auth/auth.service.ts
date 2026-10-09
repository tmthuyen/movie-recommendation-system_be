import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '@/modules/users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginRequestDto } from './dto/login.dto';
import { RegisterDto } from '@/modules/auth/dto/register.dto';
import { User, UserStatus } from '@/modules/users/entities/user.entity';
import { MailService } from '@/infrastructure/mail/mail.service';
import { SessionService } from './session.service';
import { RedisService } from '@/infrastructure/redis/redis.service';
import { RolesService } from '@/modules/roles/roles.service';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private usersService: UsersService,
    private rolesService: RolesService,
    private jwtService: JwtService,
    private mailService: MailService,
    private sessionService: SessionService,
    private redisService: RedisService,
    private userProducer: UserProducer,
    private configService: ConfigService,
  ) {}

  // 1. Xác thực thông tin người dùng
  async validateUser(loginDto: LoginRequestDto): Promise<User> {
    const user = await this.usersService.findByEmail(loginDto.username);
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // Check user status
    if (
      user.status === UserStatus.BLOCKED ||
      user.status === UserStatus.INACTIVE
    ) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    // check pass
    const matchPass = await bcrypt.compare(loginDto.password, user.password);
    if (!matchPass) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    return user;
  }

  // 2. Tạo và cấp JWT Token
  async login(user: User, userAgent: string, ip: string, deviceId: string) {
    if (!deviceId) {
      deviceId = crypto.randomUUID();
    }

    const sessionId = crypto.randomUUID();
    const jti = crypto.randomUUID();
    const payload = {
      sub: String(user.id),
      fullName: user.fullName,
      email: user.email,
      scopes: user.roles.map(r => r.code.toUpperCase()),
      sessionId: sessionId,
      jti: jti,
    };

    const session = await this.sessionService.createSession(
      user.id,
      ip,
      userAgent,
      deviceId,
      sessionId,
      jti,
    );

    return {
      accessToken: this.jwtService.sign(payload),
      session,
    };
  }

  // 3. Đăng ký tài khoản
  async register(registerDto: RegisterDto) {
    if (registerDto.password !== registerDto.passwordConfirm) {
      throw new BadRequestException('Password not matched');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Lấy role mặc định 'user' thay vì hardcode id = 1
    const defaultRole = await this.rolesService.findByCode('user');
    const roleIds = defaultRole ? [defaultRole.id] : [];

    const user = await this.usersService.create({
      ...registerDto,
      roleIds,
      password: hashedPassword,
    });

    // Tạo mã xác nhận và lưu vào Redis (hết hạn trong 1 ngày)
    const verifyToken = this.sessionService.generateOpaqueToken();
    await this.redisService.set(
      `verify_email:${verifyToken}`,
      String(user.id),
      24 * 60 * 60,
    );

    if (this.configService.get<string>('ASYNC_MAIL_ENABLED') === 'true') {
      this.userProducer.publishEmailVerificationRequested({
        userId: user.id,
        email: user.email,
        verificationToken: verifyToken,
      });
    } else {
      await this.mailService.sendVerificationEmail(user.email, verifyToken);
    }

    return {
      message: 'Đăng ký thành công, vui lòng kiểm tra email để xác nhận',
    };
  }
  // 4. Refresh Token
  async refreshToken(
    refreshToken: string,
    deviceId: string,
    userAgent: string,
    ip: string,
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('Đã đăng xuất');
    }
    const sessionId = refreshToken.split('.')[0];
    if (!sessionId) {
      throw new UnauthorizedException('Token không hợp lệ');
    }
    const session = await this.sessionService.getSession(sessionId);

    if (!session || session.refreshToken !== refreshToken) {
      // this.logger.warn('[Session]', JSON.stringify(session));
      this.logger.log('[Session Token]', session?.refreshToken);
      this.logger.log('[Refresh Token]', refreshToken);
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    const userId = session.userId;
    const user = await this.usersService.findByIdWithRoles(userId);
    if (
      !user ||
      user.status === UserStatus.BLOCKED ||
      user.status === UserStatus.INACTIVE
    ) {
      throw new UnauthorizedException('Tài khoản bị khóa hoặc không tồn tại');
    }

    // revoke the old session data
    await this.sessionService.removeSession(sessionId);

    const newJti = crypto.randomUUID();
    const newAccessToken = this.jwtService.sign({
      sub: String(user.id),
      fullName: user.fullName,
      email: user.email,
      scopes: user.roles.map(r => r.code.toUpperCase()),
      sessionId: sessionId,
      jti: newJti,
    });

    const newSession = await this.sessionService.createSession(
      user.id,
      ip,
      userAgent,
      deviceId,
      sessionId,
      newJti,
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newSession.refreshToken,
    };
  }

  // 5. Xác thực email
  async verifyEmail(token: string) {
    const userIdStr = await this.redisService.get(`verify_email:${token}`);
    if (!userIdStr) {
      throw new BadRequestException('Mã xác thực không hợp lệ hoặc đã hết hạn');
    }

    const userId = userIdStr;
    await this.usersService.updateStatus(userId, UserStatus.ACTIVE);
    await this.redisService.del(`verify_email:${token}`);
    this.userProducer.publishEmailVerified(userIdStr);
  }

  // 6. Quên mật khẩu
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return;
    }

    const resetToken = this.sessionService.generateOpaqueToken();
    await this.redisService.set(
      `reset_password:${resetToken}`,
      String(user.id),
      15 * 60,
    );

    await this.mailService.sendVerificationEmail(user.email, resetToken);
  }

  // 7. Reset mật khẩu
  async resetPassword(
    resetDto: import('./dto/reset-password.dto').ResetPasswordDto,
  ) {
    if (resetDto.password !== resetDto.passwordConfirm) {
      throw new BadRequestException('Password not matched');
    }

    const userIdStr = await this.redisService.get(
      `reset_password:${resetDto.token}`,
    );
    if (!userIdStr) {
      throw new BadRequestException('Mã xác thực không hợp lệ hoặc đã hết hạn');
    }

    const userId = userIdStr;
    const hashedPassword = await bcrypt.hash(resetDto.password, 10);
    await this.usersService.updatePassword(userId, hashedPassword);

    await this.sessionService.removeAllSessions(userId);
    await this.redisService.del(`reset_password:${resetDto.token}`);
  }

  // get me
  async getMe(userId: string) {
    if (!userId) {
      throw new UnauthorizedException('Người dùng chưa đăng nhập');
    }
    const user = await this.usersService.findByIdWithRoles(userId);
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }
    const { password, ...result } = user;
    return result;
  }

  // change password
  async changePassword(
    userId: string,
    dto: import('./dto/change-password.dto').ChangePasswordDto,
  ) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const user = await this.usersService.findByIdWithRoles(userId);
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    const matchPass = await bcrypt.compare(dto.oldPassword, user.password);
    if (!matchPass) {
      throw new BadRequestException('Mật khẩu cũ không chính xác');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.updatePassword(userId, hashedPassword);

    // Logout all as requested by user
    await this.sessionService.removeAllSessions(userId);
  }

  // sessions
  async getAllSessionsForUser(userId: string, currentSessionId: string) {
    const sessions = await this.sessionService.getAllSessionsForUser(userId);
    // Mark the current session
    sessions.forEach(session => {
      session.isCurrentSession = session.sessionId === currentSessionId;
    });
    return sessions;
  }

  // logout and logout session
  async logoutBySessionId(sessionId: string) {
    await this.sessionService.removeSession(sessionId);
  }

  // logout all
  async logoutAll(userId: string) {
    await this.sessionService.removeAllSessions(userId);
  }
}
