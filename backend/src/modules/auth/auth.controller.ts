import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Ip,
  UseGuards,
  Param,
  Delete,
  UnauthorizedException,
  Get,
  Patch,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { LoginRequestDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';
import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';

import { JwtService } from '@nestjs/jwt';
import { ApiResponse } from '@/common/dtos/api-response.dto';
import { LoginResultDto } from '@/common/dtos/auth/login-result.dto';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private authService: AuthService,
    private sessionService: SessionService,
    private jwtService: JwtService,
  ) {}

  @Public()
  @RateLimit({
    strategy: 'sliding-window',
    type: 'ip',
    limit: 5,
    windowMs: 60000,
    errorMessage: 'Quá nhiều yêu cầu đăng nhập, vui lòng thử lại sau 1 phút',
  })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginRequestDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<LoginResultDto>> {
    const user = await this.authService.validateUser(loginDto);
    const tokenData = this.authService.login(user);

    const userAgent = req.headers['user-agent'] || '';
    const deviceIdCookie = req.cookies?.deviceId;

    const session = await this.sessionService.createSession(
      user.id,
      ip,
      userAgent,
      deviceIdCookie,
      tokenData.jti,
    );

    res.cookie('refreshToken', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.cookie('deviceId', session.deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đăng nhập thành công',
      result: {
        accessToken: tokenData.accessToken,
        refreshToken: session.refreshToken,
      },
    };
  }

  @RateLimit({
    strategy: 'sliding-window',
    type: 'ip',
    limit: 5,
    windowMs: 60000,
    errorMessage: 'Quá nhiều yêu cầu đăng ký, vui lòng thử lại sau 1 phút',
  })
  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.authService.register(registerDto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: result.message,
      result: {},
    };
  }

  // refresh token: revoke old + create new access and refresh
  @Public()
  @RateLimit({
    strategy: 'token-bucket',
    type: 'ip',
    limit: 10,
    windowMs: 60000,
  })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken as string;
    const deviceId = req.cookies?.deviceId as string;
    this.logger.log(
      `[Refresh Token] ${refreshToken ? 'Present' : 'Missing'} [Device ID] ${deviceId ? 'Present' : 'Missing'}`,
    );

    if (!refreshToken || !deviceId) {
      this.logger.error(`[Refresh Token] Missing refreshToken or deviceId`);
      // cookie check
      this.logger.error(
        `[Refresh Token] Cookies: ${JSON.stringify(req.cookies)}`,
      );
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    const userIdStr = refreshToken.split('.')[0];
    const userId = userIdStr;

    if (!userId) {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const { tokenData, newSession } = await this.authService.refreshToken(
      userId,
      refreshToken,
      deviceId,
      req.headers['user-agent'] || '',
      req.ip || '',
    );

    res.cookie('refreshToken', newSession.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Làm mới token thành công',
      result: {
        accessToken: tokenData.accessToken,
        refreshToken: newSession.refreshToken,
      },
    };
  }

  // logout
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as JwtPayload;
    const deviceIdCookie = req.cookies?.deviceId;

    if (user && deviceIdCookie) {
      await this.sessionService.removeSession(user.sub, deviceIdCookie);
    }

    res.clearCookie('refreshToken');
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đăng xuất thành công',
      result: {},
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  async logoutAll(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as JwtPayload;
    if (user) {
      await this.sessionService.removeAllSessions(user.sub);
    }
    res.clearCookie('refreshToken');
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đăng xuất tất cả thiết bị thành công',
      result: {},
    };
  }

  // logout with session id: user owner
  @HttpCode(HttpStatus.OK)
  @Delete('logout/:deviceId')
  async logoutDevice(@Req() req: Request, @Param('deviceId') deviceId: string) {
    const user = req.user as JwtPayload;
    if (user) {
      await this.sessionService.removeSession(user.sub, deviceId);
    }
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đăng xuất thiết bị thành công',
      result: {},
    };
  }

  // reset passord
  @Public()
  @RateLimit({ strategy: 'sliding-window', limit: 3, windowMs: 60000 })
  @Post('reset-password')
  async resetPassword(@Body() resetDto: ResetPasswordDto) {
    await this.authService.resetPassword(resetDto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đặt lại mật khẩu thành công',
      result: {},
    };
  }

  // forgot passord
  @Public()
  @RateLimit({ strategy: 'sliding-window', limit: 3, windowMs: 60000 })
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    await this.authService.forgotPassword(email);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Vui lòng kiểm tra email để đặt lại mật khẩu',
      result: {},
    };
  }

  // verify email
  @Public()
  @Post('verify-email')
  async verifyEmail(@Body('token') token: string) {
    await this.authService.verifyEmail(token);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xác thực email thành công',
      result: {},
    };
  }

  @Get('me')
  async getMe(@Req() req: Request) {
    const userPayload = req.user as JwtPayload;

    if (!userPayload) {
      throw new UnauthorizedException('Người dùng chưa đăng nhập');
    }

    const user = await this.authService.getMe(userPayload.sub);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin thành công',
      result: user,
    };
  }

  @Patch('change-password')
  async changePassword(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: ChangePasswordDto,
  ) {
    const userPayload = req.user as JwtPayload;
    await this.authService.changePassword(userPayload.sub, dto);

    // Xóa cookie refreshToken hiện tại
    res.clearCookie('refreshToken');
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.',
      result: {},
    };
  }
}
