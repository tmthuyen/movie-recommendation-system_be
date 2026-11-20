import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SimilarMovieResponseDto } from '@/modules/recommendations/dtos/movie-response-with-score.dto';

export class ChatRequestDto {
  @ApiProperty({
    description: 'Câu hỏi hoặc mô tả phim người dùng muốn tìm',
    example: 'Gợi ý cho tôi phim hành động kịch tính',
  })
  @IsString({ message: 'Nội dung câu hỏi phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Vui lòng nhập nội dung câu hỏi.' })
  @MaxLength(1000, { message: 'Câu hỏi không được vượt quá 1000 ký tự.' })
  message: string;

  @ApiPropertyOptional({
    description: 'Số lượng phim gợi ý kèm theo (1-20)',
    default: 5,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phim phải là số nguyên.' })
  @Min(1, { message: 'Số lượng phim tối thiểu là 1.' })
  @Max(20, { message: 'Số lượng phim tối đa là 20.' })
  topK?: number;
}

export class ChatRagResponseDto {
  @ApiProperty({
    description: 'Câu trả lời từ trợ lý AI',
    example: 'Tôi gợi ý cho bạn bộ phim Người Nhện...',
  })
  answer: string;

  @ApiProperty({
    description: 'Danh sách phim liên quan kèm theo',
    type: () => [SimilarMovieResponseDto],
  })
  movies: SimilarMovieResponseDto[];

  @ApiPropertyOptional({
    description: 'Ý định được phân loại (CHITCHAT | MOVIE_SEARCH_RAG | SYSTEM_STATS | OUT_OF_SCOPE)',
    example: 'MOVIE_SEARCH_RAG',
  })
  intent?: string;

  @ApiPropertyOptional({
    description: 'Loại thống kê hệ thống (nếu intent là SYSTEM_STATS)',
    example: 'most_commented',
  })
  statType?: string;
}
