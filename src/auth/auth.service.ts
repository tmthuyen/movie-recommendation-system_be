import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginRequestDto, LoginResponseDto } from './dto/login.dto';
import { RegisterDto } from '@/auth/dto/register.dto';
import { User } from '@/users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  // 1. Xác thực thông tin người dùng
  async validateUser(loginDto: LoginRequestDto): Promise<User> {
    const user = await this.usersService.findByEmail(loginDto.username);

    // Nếu user tồn tại và password khớp
    const matchPass = await bcrypt.compare(loginDto.password, user.password);
    if (user && matchPass) {
      return user;
    }

    throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
  }

  // 2. Tạo và cấp JWT Token
  login(user: User): LoginResponseDto {
    const payload = {
      email: user.email,
      sub: user.id,
      scopes: user.roles.map((r) => r.code.toUpperCase()), // scope to auth
    };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: 'Chua co',
    };
  }

  // 3. Đăng ký tài khoản (tùy chọn)
  async register(registerDto: RegisterDto) {
    if (registerDto.password !== registerDto.password_confirm) {
      throw new BadRequestException('Password not matched');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    // Gọi UsersService để lưu vào DB...
    return this.usersService.create({
      ...registerDto,
      role_ids: [1],
      password: hashedPassword,
    });
  }
}
