import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, Max, Min } from 'class-validator';

export class CreateRatingDto {
  @ApiProperty({ example: 4.5, description: 'Điểm đánh giá (0-5)' })
  @IsNotEmpty({ message: 'Điểm đánh giá không được để trống' })
  @IsNumber()
  @Min(0)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 12345, description: 'ID của phim' })
  @IsNotEmpty({ message: 'ID phim không được để trống' })
  @IsNumber()
  movieId: number;
}
