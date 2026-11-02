import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { Expose } from 'class-transformer';

export class PeopleResponseDto extends BaseResponseDto {
  @Expose()
  id: number;

  @Expose()
  fullName: string;

  @Expose()
  birthDate: Date;

  @Expose()
  nationality: string;

  @Expose()
  gender: string;

  @Expose()
  mainRole: string;
}
