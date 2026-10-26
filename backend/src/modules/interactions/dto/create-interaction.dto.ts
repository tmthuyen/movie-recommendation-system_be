import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber } from 'class-validator';
import { InteractionType } from '../entities/interaction.entity';

/**
 * Chỉ `like` được toggle qua `POST /api/interactions`.
 * `rating` / `comment` / `click` có endpoint riêng và backend tự tính `score`.
 */
export const TOGGLEABLE_INTERACTION_TYPES = [InteractionType.LIKE] as const;

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
}
