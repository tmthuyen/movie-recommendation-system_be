import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserStatus } from '../entities/user.entity';

/** DTO riêng cho `PUT /users/:id` — admin sửa được status/cờ xác thực, user không tự sửa qua `/me`. */
export class AdminUpdateUserDto {
  @ApiProperty({ required: false, description: 'Email đăng nhập' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @ApiProperty({ required: false, description: 'Họ và tên' })
  @IsOptional()
  @IsString({ message: 'Họ tên phải là chuỗi' })
  fullName?: string;

  @ApiProperty({ required: false, description: 'Số điện thoại' })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi' })
  phoneNumber?: string;

  @ApiProperty({ required: false, description: 'Ngày sinh (ISO Date)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ' })
  birthDate?: Date;

  @ApiProperty({ required: false, description: 'Giới tính' })
  @IsOptional()
  @IsString({ message: 'Giới tính phải là chuỗi' })
  gender?: string;

  @ApiProperty({ required: false, description: 'URL ảnh đại diện' })
  @IsOptional()
  @IsString({ message: 'URL ảnh đại diện phải là chuỗi' })
  avatarUrl?: string;

  @ApiProperty({
    required: false,
    enum: UserStatus,
    description: 'Trạng thái tài khoản',
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: 'Trạng thái tài khoản không hợp lệ' })
  status?: UserStatus;

  @ApiProperty({ required: false, description: 'Đã xác thực email hay chưa' })
  @IsOptional()
  @IsBoolean({ message: 'Trường xác thực phải là boolean' })
  isVerified?: boolean;

  @ApiProperty({
    required: false,
    description: 'Dữ liệu sở thích của người dùng (thể loại, đạo diễn,...)',
    example: { genres: ['Action', 'Sci-Fi'] },
  })
  @IsOptional()
  @IsObject({ message: 'Dữ liệu sở thích phải là object' })
  preferenceData?: Record<string, string[]>;
}
