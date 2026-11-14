import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '@/modules/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { LoginRequestDto } from './dto/login.dto';
import { RegisterDto } from '@/modules/auth/dto/register.dto';
import { User, UserStatus } from '@/modules/users/entities/user.entity';
import { IMailService } from '@/infrastructure/mail/mail.service';
import { SessionData, SessionService } from './session.service';
import { RedisService } from '@/infrastructure/redis/redis.service';
import { RolesService } from '@/modules/roles/roles.service';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import {
  createPasswordResetEmailTemplate,
  createVerificationEmailTemplate,
} from '@/infrastructure/mail/mail.templates';
import { ConfigService } from '@nestjs/config';
import { ResetPasswordDto } from '@/modules/auth/dto/reset-password.dto';
import { DeviceInfoDto } from '@/modules/auth/dto/device-info.dto';
import { DataSource } from 'typeorm';
import { Role } from '@/modules/roles/entities/role.entity';
import { UserProvider } from '@/modules/users/entities/user-provider.entity';
import { hashUtil } from '@/common/utils/hash.util';
import { idUtil } from '@/common/utils/id.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly dataSource: DataSource,
    private usersService: UsersService,
    private rolesService: RolesService,
    private jwtService: JwtService,
    private sessionService: SessionService,
    private redisService: RedisService,
    private userProducer: UserProducer,
    private configService: ConfigService,
    @Inject(IMailService) private readonly mailService: IMailService,
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
    const matchPass = await hashUtil.compareBcrypt(
      loginDto.password,
      user.password,
    );
    if (!matchPass) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    return user;
  }

  // 2. Tạo và cấp JWT Token
  async login(
    user: User,
    deviceInfo: DeviceInfoDto,
  ): Promise<{ accessToken: string; session: SessionData }> {
    if (!deviceInfo.deviceId) {
      deviceInfo.deviceId = idUtil.generateUUID();
    }

    const sessionId = idUtil.generateUUID();
    const jti = idUtil.generateUUID();
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
      deviceInfo.ipAddress,
      deviceInfo.userAgent,
      deviceInfo.deviceId,
      sessionId,
      jti,
    );

    return {
      accessToken: this.jwtService.sign(payload),
      session,
    };
  }

  async loginWithGoogle(
    googleProfile: {
      googleId: string;
      email: string;
      fullName: string;
      avatar?: string;
    },
    deviceInfo: DeviceInfoDto,
  ) {
    const existingUser = await this.usersService.findByEmail(
      googleProfile.email,
    );

    if (existingUser) {
      this.logger.log(
        `[Login GG] Existing user found for email: ${googleProfile.email}, logging in.`,
      );
      return this.login(existingUser, deviceInfo);
    }

    // Create new user with default role 'user'

    // transaction to create user and assign role
    const savedUser = await this.dataSource.transaction(
      async transactionalEntityManager => {
        // check exits provider but not linked to user
        const existingProvider = await transactionalEntityManager.findOne(
          UserProvider,
          {
            where: { provider: 'google', providerId: googleProfile.googleId },
          },
        );

        // remove existing provider if exists
        if (existingProvider) {
          await transactionalEntityManager.remove(existingProvider);
          this.logger.warn(
            `[Login GG] Removed existing provider for googleId: ${googleProfile.googleId}`,
          );
        }

        const defaultRole = await transactionalEntityManager.findOne(Role, {
          where: { code: 'user' },
        });
        const userData = {
          email: googleProfile.email,
          fullName: googleProfile.fullName,
          avatarUrl: googleProfile.avatar,
          roles: defaultRole ? [defaultRole] : [],
          status: UserStatus.ACTIVE,
          isVerified: true,
        };

        const user = transactionalEntityManager.create(User, userData);
        const savedUser = await transactionalEntityManager.save(user);

        // save to user provider
        await transactionalEntityManager.save(UserProvider, {
          userId: savedUser.id,
          provider: 'google',
          providerId: googleProfile.googleId,
        });

        this.logger.log(
          `[Login GG] New user created with email: ${googleProfile.email}, userId: ${savedUser.id}`,
        );

        return savedUser;
      },
    );

    await this.userProducer.publishUserCreated({
      userId: savedUser.id,
      email: savedUser.email,
      fullName: savedUser.fullName,
      status: savedUser.status,
      preferenceData: {},
    });

    return this.login(savedUser, deviceInfo);
  }

  // 3. Đăng ký tài khoản
  async register(registerDto: RegisterDto) {
    if (registerDto.password !== registerDto.confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const hashedPassword = await hashUtil.hashBcrypt(registerDto.password, 10);

    // Lấy role mặc định 'user' thay vì hardcode id = 1
    const defaultRole = await this.rolesService.findByCode('user');
    const roleIds = defaultRole ? [defaultRole.id] : [];

    const user = await this.usersService.create({
      ...registerDto,
      roleIds,
      password: hashedPassword,
      avatarUrl: 'https://ui-avatars.com/api/?name=Default+User',
    });

    // Tạo mã xác nhận và lưu vào Redis (hết hạn trong 1 ngày)
    await this.sendVerificationEmail(String(user.id), user.email);

    return {
      message: 'Đăng ký thành công, vui lòng kiểm tra email để xác nhận',
    };
  }

  async testEmail() {
    await this.userProducer.publishEmailVerificationRequested({
      userId: '1',
      email: 'tranthuyen2222@gmail.com',
      verificationToken: 'ccccc',
    });
  }

  async sendVerificationEmail(userId: string, email: string) {
    // check verified
    const user = await this.usersService.findByIdWithRoles(userId);
    if (!user) {
      throw new BadRequestException('Người dùng không tồn tại');
    }

    // đã xác thực hoặc email sai thì không gửi email xác thực
    if (user.isVerified || user.email !== email) {
      return;
    }

    const verifyToken = this.sessionService.generateOpaqueToken();
    await this.redisService.set(
      `auth:verify_email:${verifyToken}`,
      userId,
      24 * 60 * 60,
    );

    if (this.configService.get<boolean>('ASYNC_MAIL_ENABLED') === true) {
      await this.userProducer.publishEmailVerificationRequested({
        userId: userId,
        email: email,
        verificationToken: verifyToken,
      });
    } else {
      await this.mailService.sendMail({
        to: email,
        ...createVerificationEmailTemplate(verifyToken),
      });
    }
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
      // Không log token/session (dữ liệu nhạy cảm) — xem docs/CODE_RULES.md §2.4
      this.logger.warn(
        `[Session] Refresh token không hợp lệ hoặc session đã bị thu hồi: sessionId=${sessionId}`,
      );
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

    const newJti = idUtil.generateUUID();
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
    const userIdStr = await this.redisService.get(`auth:verify_email:${token}`);
    if (!userIdStr) {
      throw new BadRequestException('Mã xác thực không hợp lệ hoặc đã hết hạn');
    }

    const userId = userIdStr;
    const user = await this.usersService.findByIdWithRoles(userId);
    await this.usersService.updateStatus(userId, UserStatus.ACTIVE, true);
    await this.redisService.del(`auth:verify_email:${token}`);
    await this.userProducer.publishEmailVerified({
      userId: user.id,
      email: user.email,
    });
  }

  // 6. Quên mật khẩu
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return;
    }

    const resetToken = this.sessionService.generateOpaqueToken();
    await this.redisService.set(
      `auth:reset_password:${resetToken}`,
      String(user.id),
      15 * 60,
    );

    await this.mailService.sendMail({
      to: user.email,
      ...createPasswordResetEmailTemplate(resetToken),
    });
  }

  // 7. Reset mật khẩu
  async resetPassword(resetDto: ResetPasswordDto) {
    if (resetDto.password !== resetDto.confirmPassword) {
      throw new BadRequestException('Password not matched');
    }

    const userIdStr = await this.redisService.get(
      `auth:reset_password:${resetDto.token}`,
    );
    if (!userIdStr) {
      throw new BadRequestException('Mã xác thực không hợp lệ hoặc đã hết hạn');
    }

    const userId = userIdStr;
    const hashedPassword = await hashUtil.hashBcrypt(resetDto.password, 10);
    await this.usersService.updatePassword(userId, hashedPassword);

    await this.sessionService.removeAllSessions(userId);
    await this.redisService.del(`auth:reset_password:${resetDto.token}`);
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

    const matchPass = await hashUtil.compareBcrypt(
      dto.oldPassword,
      user.password,
    );
    if (!matchPass) {
      throw new BadRequestException('Mật khẩu cũ không chính xác');
    }

    const hashedPassword = await hashUtil.hashBcrypt(dto.newPassword, 10);
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
