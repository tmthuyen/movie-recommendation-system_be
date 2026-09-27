import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCountryDto {
  @ApiProperty({ example: 'Vietnam', description: 'Tên quốc gia' })
  @IsNotEmpty({ message: 'Tên quốc gia không được để trống' })
  @IsString({ message: 'Tên quốc gia phải là chuỗi' })
  @MaxLength(50, { message: 'Tên quốc gia không được vượt quá 50 ký tự' })
  name: string;

  @ApiProperty({ example: 'VN', description: 'Mã quốc gia' })
  @IsNotEmpty({ message: 'Mã quốc gia không được để trống' })
  @IsString({ message: 'Mã quốc gia phải là chuỗi' })
  @MaxLength(50, { message: 'Mã quốc gia không được vượt quá 50 ký tự' })
  code: string;
}
