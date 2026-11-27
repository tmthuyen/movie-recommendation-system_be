import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { InteractionType } from '@/modules/interactions/entities/interaction.entity';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional } from 'class-validator';

/** Query cho GET /interactions/my-activities: `types` nhận danh sách phân tách bằng dấu phẩy. */
export class MyActivitiesQueryDto extends BaseSearchRequest {
  @IsOptional()
  @Transform(({ value }) => {
    const values = Array.isArray(value) ? value : [value];
    return values
      .flatMap(item => String(item ?? '').split(','))
      .map(type => type.trim())
      .filter(Boolean);
  })
  @IsArray()
  @IsIn(Object.values(InteractionType), {
    each: true,
    message: 'Loại tương tác chỉ nhận click, like, rating hoặc comment',
  })
  types?: InteractionType[];
}
