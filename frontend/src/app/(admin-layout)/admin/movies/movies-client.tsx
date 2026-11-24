'use client';

import { LayoutGrid, List } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type MovieAdminInput } from '@/apis/movie.api';
import { AdminDeleteDialog } from '@/components/admin/data-view/admin-delete-dialog';
import { AdminFormDialog } from '@/components/admin/data-view/admin-form-dialog';
import type {
  AdminFormField,
  AdminFormValues,
} from '@/components/admin/data-view/admin-form-schema';
import { AdminTablePage } from '@/components/admin/data-view/admin-table-page';
import { Button } from '@/components/ui/button';
import { adminCountries, adminGenres, adminMovies, adminPeoples } from '@/hooks/tankstack/admin';
import { useServerTable } from '@/hooks/use-server-table';
import { parseAxiosError } from '@/lib/axiosClient';
import type { Movie } from '@/shared/types/movie.types';
import { createMovieFilterFields } from './movie-filter-fields';
import { MovieDetailDialog } from './movie-detail-dialog';
import { MovieGrid } from './movie-grid';
import { createMovieColumns } from './movies-columns';
import { TmdbScannerDialog } from './tmdb-scanner-dialog';

type ViewMode = 'table' | 'grid';

const EMPTY_MOVIES: Movie[] = [];
const DEFAULT_SORTING = [{ id: 'releaseDate', desc: true }];
const OPTION_LIST_PARAMS = { page: 1, limit: 100 };

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function toNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.map(Number).filter((item) => Number.isFinite(item));
  return numbers.length > 0 ? numbers : undefined;
}

function displayTitle(movie: Movie): string {
  return movie.titleVi || movie.title || `#${movie.id}`;
}

function toDateInput(value?: string): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function MoviesClient() {
  const table = useServerTable({
    initialPageSize: 10,
    initialSorting: DEFAULT_SORTING,
  });
  const { clampPageIndex } = table;

  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const moviesQuery = adminMovies.useList(table.params);
  const movies = moviesQuery.data?.items ?? EMPTY_MOVIES;
  const total = moviesQuery.data?.pagination?.total ?? 0;

  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  const genresQuery = adminGenres.useList(OPTION_LIST_PARAMS);
  const countriesQuery = adminCountries.useList(OPTION_LIST_PARAMS);
  const peoplesQuery = adminPeoples.useList(OPTION_LIST_PARAMS);

  const genreOptions = useMemo(
    () =>
      (genresQuery.data?.items ?? []).map((genre) => ({
        value: String(genre.id),
        label: genre.name,
      })),
    [genresQuery.data],
  );

  const countryOptions = useMemo(
    () =>
      (countriesQuery.data?.items ?? []).map((country) => ({
        value: String(country.id),
        label: country.viName,
      })),
    [countriesQuery.data],
  );

  const peopleOptions = useMemo(
    () =>
      (peoplesQuery.data?.items ?? []).map((people) => ({
        value: String(people.id),
        label: people.fullName ?? people.name ?? `#${people.id}`,
      })),
    [peoplesQuery.data],
  );

  const filterFields = useMemo(
    () =>
      createMovieFilterFields({
        genreOptions,
        countryOptions,
        peopleOptions,
      }),
    [genreOptions, countryOptions, peopleOptions],
  );

  const formFields = useMemo<AdminFormField[]>(
    () => [
      {
        name: 'title',
        label: 'Tên phim',
        required: true,
        maxLength: 255,
        placeholder: 'VD: The Matrix',
        wide: true,
      },
      {
        name: 'titleVi',
        label: 'Tên tiếng Việt',
        maxLength: 255,
        placeholder: 'VD: Ma trận',
      },
      {
        name: 'status',
        label: 'Trạng thái',
        maxLength: 50,
        placeholder: 'VD: Released',
      },
      {
        name: 'releaseDate',
        label: 'Ngày phát hành',
        type: 'date',
      },
      {
        name: 'originCountry',
        label: 'Quốc gia gốc',
        maxLength: 255,
        placeholder: 'VD: US',
      },
      {
        name: 'originalLanguage',
        label: 'Ngôn ngữ gốc',
        maxLength: 50,
        placeholder: 'VD: en',
      },
      {
        name: 'posterPath',
        label: 'Poster (path hoặc URL)',
        maxLength: 255,
        placeholder: '/abc123.jpg hoặc https://…',
        wide: true,
      },
      {
        name: 'backdropPath',
        label: 'Backdrop (path hoặc URL)',
        maxLength: 255,
        placeholder: '/abc123.jpg hoặc https://…',
        wide: true,
      },
      {
        name: 'overview',
        label: 'Mô tả (tiếng Anh)',
        type: 'textarea',
        placeholder: 'Nội dung tóm tắt phim…',
      },
      {
        name: 'overviewVi',
        label: 'Mô tả (tiếng Việt)',
        type: 'textarea',
        placeholder: 'Nội dung tóm tắt phim…',
      },
      {
        name: 'genreIds',
        label: 'Thể loại',
        type: 'multiselect',
        options: genreOptions,
        placeholder: 'Chọn thể loại',
        wide: true,
      },
      {
        name: 'countryId',
        label: 'Quốc gia',
        type: 'select',
        options: countryOptions,
        placeholder: 'Chọn quốc gia',
      },
      {
        name: 'peopleIds',
        label: 'Diễn viên / đạo diễn',
        type: 'multiselect',
        options: peopleOptions,
        placeholder: 'Chọn người tham gia',
        wide: true,
      },
    ],
    [genreOptions, countryOptions, peopleOptions],
  );

  const createMovie = adminMovies.useCreate();
  const updateMovie = adminMovies.useUpdate();
  const deleteMovie = adminMovies.useDelete();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Movie | null>(null);
  const [detailTarget, setDetailTarget] = useState<Movie | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Movie | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (movie: Movie) => {
    setEditing(movie);
    setFormOpen(true);
  };

  const columns = useMemo(
    () =>
      createMovieColumns({
        onEdit: openEdit,
        onViewDetail: (movie) => setDetailTarget(movie),
        onDelete: (movie) => setDeleteTarget(movie),
      }),
    // Các callback chỉ set state, không phụ thuộc dữ liệu.

    [],
  );

  const defaultValues = useMemo<AdminFormValues>(() => {
    if (!editing) {
      return {
        title: '',
        titleVi: '',
        status: '',
        releaseDate: '',
        originCountry: '',
        originalLanguage: '',
        posterPath: '',
        backdropPath: '',
        overview: '',
        overviewVi: '',
        genreIds: [],
        countryId: '',
        peopleIds: [],
      };
    }

    const countries = editing.countries ?? [];
    const countryId = countries[0]?.id ?? editing.country?.id;

    return {
      title: editing.title ?? '',
      titleVi: editing.titleVi ?? '',
      status: editing.status ?? '',
      releaseDate: toDateInput(editing.releaseDate),
      originCountry: editing.originCountry ?? '',
      originalLanguage: editing.originalLanguage ?? '',
      posterPath: editing.posterPath ?? '',
      backdropPath: editing.backdropPath ?? '',
      overview: editing.overview ?? '',
      overviewVi: editing.overviewVi ?? '',
      genreIds: (editing.genres ?? []).map((genre) => String(genre.id)),
      countryId: countryId !== undefined ? String(countryId) : '',
      peopleIds: [],
    };
  }, [editing]);

  const handleSubmit = async (values: AdminFormValues) => {
    const input: MovieAdminInput = {
      title: String(values.title ?? '').trim(),
      titleVi: optionalText(values.titleVi),
      status: optionalText(values.status),
      releaseDate: optionalText(values.releaseDate),
      originCountry: optionalText(values.originCountry),
      originalLanguage: optionalText(values.originalLanguage),
      posterPath: optionalText(values.posterPath),
      backdropPath: optionalText(values.backdropPath),
      overview: optionalText(values.overview),
      overviewVi: optionalText(values.overviewVi),
      genreIds: toNumberArray(values.genreIds),
      countryId: values.countryId ? Number(values.countryId) : undefined,
      peopleIds: toNumberArray(values.peopleIds),
    };

    if (editing) {
      await updateMovie.mutateAsync({ id: editing.id, data: input });
    } else {
      await createMovie.mutateAsync(input);
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMovie.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  const hasQuery = Boolean(table.keyword) || table.filters.length > 0;

  const viewToggle = (
    <div
      className="border-border/70 inline-flex items-center gap-1 rounded-xl border p-1"
      role="group"
      aria-label="Chế độ xem danh sách phim"
    >
      <Button
        type="button"
        variant={viewMode === 'table' ? 'secondary' : 'ghost'}
        className="h-11 cursor-pointer gap-1.5 px-3"
        aria-pressed={viewMode === 'table'}
        onClick={() => setViewMode('table')}
      >
        <List className="size-4" aria-hidden />
        Bảng
      </Button>
      <Button
        type="button"
        variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
        className="h-11 cursor-pointer gap-1.5 px-3"
        aria-pressed={viewMode === 'grid'}
        onClick={() => setViewMode('grid')}
      >
        <LayoutGrid className="size-4" aria-hidden />
        Lưới
      </Button>
    </div>
  );

  return (
    <AdminTablePage
      table={table}
      columns={columns}
      data={movies}
      total={total}
      isLoading={moviesQuery.isLoading}
      isFetching={moviesQuery.isFetching}
      error={moviesQuery.error}
      onRetry={() => void moviesQuery.refetch()}
      searchPlaceholder="Tìm theo tên phim…"
      searchLabel="Tìm kiếm phim"
      filterFields={filterFields}
      entityLabel="phim"
      emptyDescription="Thêm phim đầu tiên để bắt đầu quản lý thư viện."
      addLabel="Thêm phim"
      onAdd={openCreate}
      toolbarActions={
        <>
          <TmdbScannerDialog />
          {viewToggle}
        </>
      }
      body={
        viewMode === 'grid' ? (
          <MovieGrid
            movies={movies}
            isLoading={moviesQuery.isLoading}
            error={moviesQuery.error}
            onRetry={() => void moviesQuery.refetch()}
            hasQuery={hasQuery}
            onClearQuery={() => {
              table.setKeywordInput('');
              table.clearFilters();
            }}
            onEdit={openEdit}
            onDelete={(movie) => setDeleteTarget(movie)}
            onViewDetail={(movie) => setDetailTarget(movie)}
            onAdd={openCreate}
            addLabel="Thêm phim"
          />
        ) : undefined
      }
    >
      <AdminFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa phim' : 'Thêm phim'}
        description={
          editing
            ? `Cập nhật thông tin phim “${displayTitle(editing)}”.`
            : 'Tạo phim mới trong thư viện.'
        }
        fields={formFields}
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        submitting={createMovie.isPending || updateMovie.isPending}
        submitLabel={editing ? 'Lưu thay đổi' : 'Thêm phim'}
        mapServerError={(error) => {
          const parsed = parseAxiosError(error);
          if (parsed.statusCode === 409) {
            return { field: 'title', message: 'Phim này đã tồn tại' };
          }
          return null;
        }}
      />

      <MovieDetailDialog
        movie={detailTarget}
        open={detailTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDetailTarget(null);
        }}
        onEdit={(movie) => {
          setDetailTarget(null);
          openEdit(movie);
        }}
      />

      <AdminDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="Xóa phim?"
        description={
          <>
            Phim{' '}
            <span className="text-foreground font-medium">
              {deleteTarget ? displayTitle(deleteTarget) : 'này'}
            </span>{' '}
            sẽ bị xóa vĩnh viễn khỏi thư viện. Hành động này không thể hoàn tác.
          </>
        }
        onConfirm={handleDelete}
        deleting={deleteMovie.isPending}
      />
    </AdminTablePage>
  );
}
