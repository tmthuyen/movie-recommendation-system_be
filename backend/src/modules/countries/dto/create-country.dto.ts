import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCountryDto {
  @ApiProperty({ example: 'Vietnam', description: 'Tên quốc gia' })
  @IsNotEmpty({ message: 'Tên quốc gia không được để trống' })
  @IsString({ message: 'Tên quốc gia phải là chuỗi' })
  @MaxLength(50, { message: 'Tên quốc gia không được vượt quá 50 ký tự' })
  viName: string;

  @ApiProperty({ example: 'Vietnam', description: 'Tên quốc gia (tiếng Anh)' })
  @IsNotEmpty({ message: 'Tên quốc gia (tiếng Anh) không được để trống' })
  @IsString({ message: 'Tên quốc gia (tiếng Anh) phải là chuỗi' })
  @MaxLength(50, {
    message: 'Tên quốc gia (tiếng Anh) không được vượt quá 50 ký tự',
  })
  enName: string;

  @ApiProperty({ example: 'VN', description: 'Mã quốc gia' })
  @IsNotEmpty({ message: 'Mã quốc gia không được để trống' })
  @IsString({ message: 'Mã quốc gia phải là chuỗi' })
  @MaxLength(2, { message: 'Mã quốc gia không được vượt quá 2 ký tự' })
  code: string;

  @ApiProperty({ example: 'Asia', description: 'Khu vực' })
  @IsNotEmpty({ message: 'Khu vực không được để trống' })
  @IsString({ message: 'Khu vực phải là chuỗi' })
  @MaxLength(50, { message: 'Khu vực không được vượt quá 50 ký tự' })
  region: string;
}
