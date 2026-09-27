import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Phim này rất hay!', description: 'Nội dung bình luận' })
  @IsNotEmpty({ message: 'Nội dung bình luận không được để trống' })
  @IsString()
  content: string;

  @ApiProperty({ example: 12345, description: 'ID của phim' })
  @IsNotEmpty({ message: 'ID phim không được để trống' })
  @IsNumber()
  movieId: number;

  @ApiProperty({ example: 1, description: 'ID bình luận cha (nếu là reply)', required: false })
  @IsOptional()
  @IsNumber()
  parentId?: number;
}
