import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { PeopleResponseDto } from '@/modules/peoples/dto/people-response.dto';
import { Expose, Type } from 'class-transformer';

export class MoviePeopleResponseDto extends BaseResponseDto {
  @Expose()
  @Type(() => PeopleResponseDto)
  people: PeopleResponseDto;

  @Expose()
  role: string;
}
