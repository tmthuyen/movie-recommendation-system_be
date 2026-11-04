import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Movie } from '@/shared/types/movie.types';
import { MovieCard } from './movie-card';

// MovieActions kéo theo React Query/socket — không cần cho test render card.
vi.mock('./movie-actions', () => ({
  MovieActions: () => <button type="button">Yêu thích</button>,
}));

const baseDto = {
  createdAt: new Date('2024-01-01'),
  createdBy: 'system',
  updatedAt: new Date('2024-01-01'),
  updatedBy: 'system',
};

const movieFixture: Movie = {
  ...baseDto,
  id: 1,
  title: 'Dune',
  titleVi: 'Dune: Hành Tinh Cát',
  overview: 'Hành trình trên sa mạc Arrakis.',
  overviewVi: 'Hành trình trên sa mạc Arrakis (VI).',
  releaseDate: '2024-03-01',
  posterPath: '/dune.jpg',
  backdropPath: '/dune-backdrop.jpg',
  voteAverage: 8.25,
  viewCount: 1234,
  likeCount: 10,
  genres: [
    { id: 'g1', name: 'Hành động' },
    { id: 'g2', name: 'Khoa học' },
  ],
};

describe('MovieCard', () => {
  it('hiển thị tiêu đề tiếng Việt, tiêu đề gốc và link tới trang chi tiết', () => {
    render(<MovieCard movie={movieFixture} />);

    expect(screen.getByRole('heading', { name: 'Dune: Hành Tinh Cát' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dune' })).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Dune: Hành Tinh Cát' });
    expect(link).toHaveAttribute('href', '/movies/1');
    expect(link).toHaveAttribute('title', 'Dune: Hành Tinh Cát');
  });

  it('render poster qua next/image (đã mock) với alt là tiêu đề', () => {
    render(<MovieCard movie={movieFixture} />);

    // Card ưu tiên backdropPath (ảnh ngang) trước posterPath.
    const image = screen.getByRole('img', { name: 'Dune: Hành Tinh Cát' });
    expect(image).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w500/dune-backdrop.jpg',
    );
  });

  it('hiển thị điểm đánh giá đã làm tròn 1 chữ số', () => {
    render(<MovieCard movie={movieFixture} />);

    expect(screen.getByText('8.3')).toBeInTheDocument();
  });

  it('hiển thị năm phát hành, lượt xem (định dạng vi-VN) và thể loại', () => {
    render(<MovieCard movie={movieFixture} />);

    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText(/1\.234 lượt xem/)).toBeInTheDocument();
    expect(screen.getByText('Hành động')).toBeInTheDocument();
    expect(screen.getByText('Khoa học')).toBeInTheDocument();
  });

  it('ưu tiên overview tiếng Việt', () => {
    render(<MovieCard movie={movieFixture} />);

    expect(screen.getByText('Hành trình trên sa mạc Arrakis (VI).')).toBeInTheDocument();
  });

  it('không render ảnh khi phim không có poster/backdrop', () => {
    render(
      <MovieCard
        movie={{ ...movieFixture, posterPath: undefined, backdropPath: undefined }}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dune: Hành Tinh Cát' })).toBeInTheDocument();
  });

  it('không hiển thị điểm đánh giá khi voteAverage = 0', () => {
    render(<MovieCard movie={{ ...movieFixture, voteAverage: 0 }} />);

    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  });

  it('fallback tiêu đề "Chưa có tiêu đề" khi phim thiếu cả hai tiêu đề', () => {
    render(<MovieCard movie={{ ...movieFixture, title: undefined, titleVi: undefined }} />);

    expect(screen.getByRole('link', { name: 'Chưa có tiêu đề' })).toBeInTheDocument();
  });
});
