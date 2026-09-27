import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber } from 'class-validator';
import { InteractionType } from '../entities/interaction.entity';

export class CreateInteractionDto {
  @ApiProperty({
    example: 1,
    description: 'Điểm số (ví dụ: 1 cho like/favorite)',
  })
  @IsNotEmpty({ message: 'Score không được để trống' })
  @IsNumber()
  score: number;

  @ApiProperty({ enum: InteractionType, description: 'Loại tương tác' })
  @IsNotEmpty({ message: 'Type không được để trống' })
  @IsEnum(InteractionType)
  type: InteractionType;

  @ApiProperty({ example: 123, description: 'ID phim' })
  @IsNotEmpty({ message: 'Movie ID không được để trống' })
  @IsNumber()
  movieId: number;
}
