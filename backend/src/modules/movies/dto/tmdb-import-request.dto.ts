import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import { parseTmdbIds } from './tmdb-discover-request.dto';

export class TmdbImportRequestDto {
  @ValidateIf((dto: TmdbImportRequestDto) => dto.tmdbIds === undefined)
  @IsInt()
  @Min(1)
  tmdbId?: number;

  @IsOptional()
  @Transform(({ value }) => parseTmdbIds(value))
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  tmdbIds?: number[];
}
