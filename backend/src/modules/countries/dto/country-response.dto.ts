import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { Expose, Type } from 'class-transformer';

export class CountryResponseDto extends BaseResponseDto {
  @Expose()
  @Type(() => Number)
  id: number;

  @Expose()
  viName: string;

  @Expose()
  enName?: string;

  @Expose()
  code: string;

  @Expose()
  region?: string;

  @Expose()
  subregion?: string;
}
