import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    example: 'Phim này rất hay!',
    description: 'Nội dung bình luận',
  })
  @IsNotEmpty({ message: 'Nội dung bình luận không được để trống' })
  @IsString()
  content: string;

  @ApiProperty({ example: 12345, description: 'ID của phim' })
  @Type(() => Number)
  @IsNotEmpty({ message: 'ID phim không được để trống' })
  @IsNumber({}, { message: 'ID phim phải là số' })
  movieId: number;

  @ApiProperty({
    example: 1,
    description: 'ID bình luận cha (nếu là reply)',
    required: false,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'ID bình luận cha phải là số' })
  parentId?: number;
}
