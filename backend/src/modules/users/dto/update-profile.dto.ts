import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsObject, IsDateString } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, description: 'Họ và tên' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ required: false, description: 'URL ảnh đại diện' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ required: false, description: 'Số điện thoại' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ required: false, description: 'Ngày sinh (ISO Date)' })
  @IsOptional()
  @IsDateString()
  birthDate?: Date;

  @ApiProperty({ required: false, description: 'Giới tính' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({
    required: false,
    description: 'Dữ liệu sở thích của người dùng (thể loại, đạo diễn,...)',
    example: { genres: ['Action', 'Sci-Fi'] },
  })
  @IsOptional()
  @IsObject()
  preferenceData?: Record<string, any>;
}
