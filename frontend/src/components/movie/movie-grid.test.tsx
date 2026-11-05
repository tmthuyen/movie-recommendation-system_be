import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Movie } from '@/shared/types/movie.types';
import { MovieGrid } from './movie-grid';

vi.mock('./movie-actions', () => ({
  MovieActions: () => <button type="button">Yêu thích</button>,
}));

const baseDto = {
  createdAt: new Date('2024-01-01'),
  createdBy: 'system',
  updatedAt: new Date('2024-01-01'),
  updatedBy: 'system',
};

const makeMovie = (id: number, title: string, titleVi: string): Movie => ({
  ...baseDto,
  id,
  title,
  titleVi,
  overview: 'Mô tả',
  releaseDate: '2024-03-01',
  posterPath: `/${id}.jpg`,
  backdropPath: `/${id}-backdrop.jpg`,
  voteAverage: 8,
  viewCount: 10,
  likeCount: 1,
  genres: [],
});

describe('MovieGrid', () => {
  it('render đủ card trong một motion parent dạng grid', () => {
    const { container } = render(
      <MovieGrid movies={[makeMovie(1, 'Dune', 'Dune VI'), makeMovie(2, 'Alien', 'Alien VI')]} />,
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid).toHaveClass('grid');
    expect(grid.children).toHaveLength(2);
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Dune VI' })).toHaveAttribute('href', '/movies/1');
    expect(screen.getByRole('link', { name: 'Alien VI' })).toHaveAttribute('href', '/movies/2');
  });

  it('render rỗng không lỗi', () => {
    const { container } = render(<MovieGrid movies={[]} />);

    expect(container.firstElementChild).toHaveClass('grid');
    expect(container.firstElementChild?.children).toHaveLength(0);
  });
});
