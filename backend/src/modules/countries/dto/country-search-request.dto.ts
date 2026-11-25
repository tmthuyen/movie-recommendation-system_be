import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Query params cho `GET /api/countries`.
 *
 * `hasMovies=true` chỉ trả country có ít nhất một quan hệ trong
 * `movie_countries` (dùng cho các trang public). Admin không truyền cờ này
 * để lấy đầy đủ danh sách country.
 */
export class CountrySearchRequestDto extends BaseSearchRequest {
  @IsOptional()
  @Transform(({ value }) => {
    const raw = Array.isArray(value) ? value[0] : value;

    if (raw === undefined || raw === null || raw === '') {
      return undefined;
    }
    if (typeof raw === 'boolean') {
      return raw;
    }

    return raw === 'true' || raw === '1';
  })
  @IsBoolean()
  hasMovies?: boolean;
}
