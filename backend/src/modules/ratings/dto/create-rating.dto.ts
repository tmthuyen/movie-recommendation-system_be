import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, Max, Min } from 'class-validator';

export class CreateRatingDto {
  @ApiProperty({ example: 4.5, description: 'Điểm đánh giá (0-5)' })
  @Type(() => Number)
  @IsNotEmpty({ message: 'Điểm đánh giá không được để trống' })
  @IsNumber({}, { message: 'Điểm đánh giá phải là số' })
  @Min(0, { message: 'Điểm đánh giá tối thiểu 0' })
  @Max(5, { message: 'Điểm đánh giá tối đa 5' })
  rating: number;

  @ApiProperty({ example: 12345, description: 'ID của phim' })
  @Type(() => Number)
  @IsNotEmpty({ message: 'ID phim không được để trống' })
  @IsNumber({}, { message: 'ID phim phải là số' })
  movieId: number;
}
