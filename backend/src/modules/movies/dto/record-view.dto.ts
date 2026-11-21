import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { InteractionGenreDto } from '@/modules/interactions/dto/create-interaction.dto';

export class RecordViewDto {
  @ApiProperty({
    type: [InteractionGenreDto],
    required: false,
    description: 'Genre của phim để cập nhật user genre vector',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InteractionGenreDto)
  genres?: InteractionGenreDto[];
}
