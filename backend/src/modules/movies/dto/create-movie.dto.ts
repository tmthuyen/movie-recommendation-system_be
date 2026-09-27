import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMovieDto {
  @ApiProperty({ example: 'The Matrix', description: 'Tên tiếng Anh' })
  @IsNotEmpty({ message: 'Tên không được để trống' })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'Ma Trận', description: 'Tên tiếng Việt', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleVi?: string;

  @ApiProperty({ example: 'A computer hacker learns from mysterious rebels about the true nature of his reality...', required: false })
  @IsOptional()
  @IsString()
  overview?: string;

  @ApiProperty({ example: 'Một hacker máy tính học được từ những phiến quân bí ẩn về bản chất thực sự của thực tại...', required: false })
  @IsOptional()
  @IsString()
  overviewVi?: string;

  @ApiProperty({ example: '1999-03-31', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  releaseDate?: string;

  @ApiProperty({ example: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  posterPath?: string;

  @ApiProperty({ example: '/lD8m5p3w3A7vD2Y3w8n5w1eL4V.jpg', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  backdropPath?: string;

  @ApiProperty({ example: 'US', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  originCountry?: string;

  @ApiProperty({ example: 'en', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  originalLanguage?: string;

  @ApiProperty({ example: 63000000, required: false })
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiProperty({ example: 463517383, required: false })
  @IsOptional()
  @IsNumber()
  revenue?: number;

  @ApiProperty({ example: 'Released', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  video?: boolean;

  @ApiProperty({ example: 8.2, required: false })
  @IsOptional()
  @IsNumber()
  voteAverage?: number;

  @ApiProperty({ example: 23000, required: false })
  @IsOptional()
  @IsNumber()
  voteCount?: number;

  @ApiProperty({ example: [28, 878], description: 'Mảng các ID thể loại', required: false })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  genreIds?: number[];

  @ApiProperty({ example: 1, description: 'ID của quốc gia', required: false })
  @IsOptional()
  @IsNumber()
  countryId?: number;

  @ApiProperty({ example: [1, 2, 3], description: 'Mảng các ID diễn viên/đạo diễn', required: false })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  peopleIds?: number[];
}
