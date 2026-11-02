import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class HybridSearchQuery {
  @ApiProperty({ example: '123', description: 'User ID' })
  @IsNotEmpty({ message: 'User ID không được để trống' })
  userId: string;

  @ApiProperty({ example: 'action', description: 'Keyword' })
  @IsOptional()
  @MaxLength(255, { message: 'Keyword không được vượt quá 255 ký tự' })
  keyword?: string;

  @ApiProperty({ example: 10, description: 'Top K' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Top K phải lớn hơn hoặc bằng 1' })
  @Max(100, { message: 'Top K không được vượt quá 100' })
  topK?: number = 50;

  @ApiProperty({ example: 1, description: 'Page' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Page phải lớn hơn hoặc bằng 1' })
  page?: number = 1;

  @ApiProperty({ example: 10, description: 'Page Size' })
  @IsOptional()
  @Min(1, { message: 'Page Size phải lớn hơn hoặc bằng 1' })
  @Max(100, { message: 'Page Size không được vượt quá 100' })
  @IsInt()
  pageSize?: number = 20;
}
