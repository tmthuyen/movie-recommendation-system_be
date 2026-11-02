import { Expose } from 'class-transformer';

export class BaseResponseDto {
  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  @Expose()
  createdBy: string;

  @Expose()
  updatedBy: string;
}
