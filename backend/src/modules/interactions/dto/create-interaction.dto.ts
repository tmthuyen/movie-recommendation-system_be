import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { InteractionType } from '../entities/interaction.entity';

/**
 * Chỉ `like` được toggle qua `POST /api/interactions`.
 * `rating` / `comment` / `click` có endpoint riêng và backend tự tính `score`.
 */
export const TOGGLEABLE_INTERACTION_TYPES = [InteractionType.LIKE] as const;

/** Genre của phim do frontend gửi kèm để cập nhật user genre vector. */
export class InteractionGenreDto {
  @ApiProperty({ example: 12, description: 'ID genre' })
  @Type(() => Number)
  @IsInt()
  id: number;

  @ApiProperty({ example: 'Kinh dị', description: 'Tên genre' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateInteractionDto {
  @ApiProperty({
    enum: TOGGLEABLE_INTERACTION_TYPES,
    example: InteractionType.LIKE,
    description: 'Loại tương tác (chỉ hỗ trợ like)',
  })
  @IsNotEmpty({ message: 'Type không được để trống' })
  @IsIn(TOGGLEABLE_INTERACTION_TYPES, {
    message: 'Chỉ hỗ trợ tương tác like',
  })
  type: InteractionType;

  @ApiProperty({ example: 123, description: 'ID phim' })
  @Type(() => Number)
  @IsNotEmpty({ message: 'Movie ID không được để trống' })
  @IsNumber({}, { message: 'Movie ID phải là số' })
  movieId: number;

  @ApiProperty({
    type: [InteractionGenreDto],
    required: false,
    description:
      'Danh sách genre của phim (id + name) để cập nhật vector genre',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InteractionGenreDto)
  genres?: InteractionGenreDto[];
}
