import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { Expose } from 'class-transformer';

export class GenreResponseDto extends BaseResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  enName?: string;
}
