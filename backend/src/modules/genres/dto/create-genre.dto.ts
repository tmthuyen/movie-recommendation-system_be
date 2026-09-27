import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGenreDto {
  @ApiProperty({ example: 'Action', description: 'Tên thể loại' })
  @IsNotEmpty({ message: 'Tên thể loại không được để trống' })
  @IsString({ message: 'Tên thể loại phải là chuỗi' })
  @MaxLength(100, { message: 'Tên thể loại không được vượt quá 100 ký tự' })
  name: string;

  @ApiProperty({ example: 'Action', description: 'Tên thể loại (Tiếng Anh)' })
  @IsOptional()
  @IsString({ message: 'Tên thể loại phải là chuỗi' })
  @MaxLength(100, { message: 'Tên thể loại không được vượt quá 100 ký tự' })
  enName?: string;
}
