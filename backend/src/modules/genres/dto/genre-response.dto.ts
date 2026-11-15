import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { Expose, Type } from 'class-transformer';

export class GenreResponseDto extends BaseResponseDto {
  @Expose()
  @Type(() => Number)
  id: number;

  @Expose()
  name: string;

  @Expose()
  enName?: string;
}
