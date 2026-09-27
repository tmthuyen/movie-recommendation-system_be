import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, MaxLength } from 'class-validator';

export class CreateGenreDto {
  @ApiProperty({ example: 28, description: 'ID của thể loại (ví dụ từ TMDB)' })
  @IsNotEmpty({ message: 'ID không được để trống' })
  @IsNumber({}, { message: 'ID phải là số' })
  id: number;

  @ApiProperty({ example: 'Action', description: 'Tên thể loại' })
  @IsNotEmpty({ message: 'Tên thể loại không được để trống' })
  @IsString({ message: 'Tên thể loại phải là chuỗi' })
  @MaxLength(100, { message: 'Tên thể loại không được vượt quá 100 ký tự' })
  name: string;
}
