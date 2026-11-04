import { beforeEach, describe, expect, it } from 'vitest';
import { useMovieFilterStore } from './movie-filter.store';

const DEFAULT_STATE = {
  keyword: '',
  genreId: null,
  countryId: null,
  sort: 'newest' as const,
  page: 1,
  limit: 24,
};

describe('movie-filter.store', () => {
  beforeEach(() => {
    useMovieFilterStore.getState().resetFilter();
  });

  it('khởi tạo với bộ lọc mặc định', () => {
    expect(useMovieFilterStore.getState()).toMatchObject(DEFAULT_STATE);
  });

  it('setFilter cập nhật một phần và mặc định quay về trang 1', () => {
    useMovieFilterStore.getState().setPage(5);
    useMovieFilterStore.getState().setFilter({ keyword: 'dune', sort: 'rating' });

    const state = useMovieFilterStore.getState();
    expect(state).toMatchObject({ keyword: 'dune', sort: 'rating', page: 1 });
    expect(state.genreId).toBeNull();
  });

  it('setFilter tôn trọng page nếu được truyền tường minh', () => {
    useMovieFilterStore.getState().setFilter({ genreId: '3', page: 4 });

    expect(useMovieFilterStore.getState()).toMatchObject({ genreId: '3', page: 4 });
  });

  it('setPage chỉ đổi trang, không đổi filter khác', () => {
    useMovieFilterStore.getState().setFilter({ keyword: 'avatar', countryId: '2' });
    useMovieFilterStore.getState().setPage(3);

    expect(useMovieFilterStore.getState()).toMatchObject({
      keyword: 'avatar',
      countryId: '2',
      page: 3,
    });
  });

  it('resetFilter đưa toàn bộ state về mặc định', () => {
    useMovieFilterStore.getState().setFilter({
      keyword: 'x',
      genreId: '1',
      countryId: '2',
      sort: 'popular',
      page: 9,
    });

    useMovieFilterStore.getState().resetFilter();

    expect(useMovieFilterStore.getState()).toMatchObject(DEFAULT_STATE);
  });

  it('không làm mất hàm action sau khi set state', () => {
    useMovieFilterStore.getState().setFilter({ keyword: 'abc' });

    expect(typeof useMovieFilterStore.getState().setFilter).toBe('function');
    expect(typeof useMovieFilterStore.getState().setPage).toBe('function');
    expect(typeof useMovieFilterStore.getState().resetFilter).toBe('function');
  });
});
