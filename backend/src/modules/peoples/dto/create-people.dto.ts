import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePeopleDto {
  @ApiProperty({ example: 'Tom Holland', description: 'Tên đầy đủ' })
  @IsNotEmpty({ message: 'Tên không được để trống' })
  @IsString({ message: 'Tên phải là chuỗi' })
  @MaxLength(100, { message: 'Tên không vượt quá 100 ký tự' })
  fullName: string;

  @ApiProperty({
    example: '1996-06-01',
    description: 'Ngày sinh',
    required: false,
  })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh phải là định dạng ISO (YYYY-MM-DD)' })
  birthDate?: Date;

  @ApiProperty({
    example: 'British',
    description: 'Quốc tịch',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Quốc tịch phải là chuỗi' })
  @MaxLength(50, { message: 'Quốc tịch không vượt quá 50 ký tự' })
  nationality?: string;

  @ApiProperty({ example: 'Male', description: 'Giới tính', required: false })
  @IsOptional()
  @IsString({ message: 'Giới tính phải là chuỗi' })
  @MaxLength(20, { message: 'Giới tính không vượt quá 20 ký tự' })
  gender?: string;

  @ApiProperty({
    example: 'actor',
    description: 'Vai trò chính',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Vai trò phải là chuỗi' })
  @MaxLength(50, { message: 'Vai trò không vượt quá 50 ký tự' })
  mainRole?: string;
}
