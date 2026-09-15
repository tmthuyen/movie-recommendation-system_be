import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '@/modules/users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginRequestDto } from './dto/login.dto';
import { RegisterDto } from '@/modules/auth/dto/register.dto';
import { User, UserStatus } from '@/modules/users/entities/user.entity';
import { MailService } from '@/modules/mail/mail.service';
import { SessionService } from './session.service';
import { RedisService } from '@/modules/redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private sessionService: SessionService,
    private redisService: RedisService,
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
  login(user: User) {
    const jti = crypto.randomUUID();
    const payload = {
      sub: String(user.id),
      fullName: user.fullName,
      email: user.email,
      scopes: user.roles.map(r => r.code.toUpperCase()),
      jti,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      jti,
    };
  }

  // 3. Đăng ký tài khoản
  async register(registerDto: RegisterDto) {
    if (registerDto.password !== registerDto.passwordConfirm) {
      throw new BadRequestException('Password not matched');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    // Gọi UsersService để lưu vào DB...
    const user = await this.usersService.create({
      ...registerDto,
      roleIds: [1], // TODO: Configurable default role
      password: hashedPassword,
    });

    // Tạo mã xác nhận và lưu vào Redis (hết hạn trong 1 ngày)
    const verifyToken = this.sessionService.generateOpaqueToken();
    await this.redisService.set(
      `verify_email:${verifyToken}`,
      String(user.id),
      24 * 60 * 60,
    );

    // Gửi email
    await this.mailService.sendVerificationEmail(user.email, verifyToken);

    return {
      message: 'Đăng ký thành công, vui lòng kiểm tra email để xác nhận',
    };
  }
  // 4. Refresh Token
  async refreshToken(
    userId: number,
    refreshToken: string,
    deviceId: string,
    userAgent: string,
    ip: string,
  ) {
    const session = await this.sessionService.getSession(userId, deviceId);
    if (!session || session.refreshToken !== refreshToken) {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    const user = await this.usersService.findByIdWithRoles(userId);
    if (
      !user ||
      user.status === UserStatus.BLOCKED ||
      user.status === UserStatus.INACTIVE
    ) {
      throw new UnauthorizedException('Tài khoản bị khóa hoặc không tồn tại');
    }

    await this.sessionService.removeSession(userId, deviceId);
    const tokenData = this.login(user);
    const newSession = await this.sessionService.createSession(
      userId,
      ip,
      userAgent,
      deviceId,
      tokenData.jti,
    );

    return { tokenData, newSession };
  }

  // 5. Xác thực email
  async verifyEmail(token: string) {
    const userIdStr = await this.redisService.get(`verify_email:${token}`);
    if (!userIdStr) {
      throw new BadRequestException('Mã xác thực không hợp lệ hoặc đã hết hạn');
    }

    const userId = Number(userIdStr);
    await this.usersService.updateStatus(userId, UserStatus.ACTIVE);
    await this.redisService.del(`verify_email:${token}`);
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

    const userId = Number(userIdStr);
    const hashedPassword = await bcrypt.hash(resetDto.password, 10);
    await this.usersService.updatePassword(userId, hashedPassword);

    await this.sessionService.removeAllSessions(userId);
    await this.redisService.del(`reset_password:${resetDto.token}`);
  }
}
