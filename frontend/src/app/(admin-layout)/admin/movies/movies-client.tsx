'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import { CrudToolbar } from '@/components/admin/crud-toolbar';
import { CrudTableSkeleton, DataTable, DataTableColumn } from '@/components/admin/data-table';
import { CrudDeleteDialog } from '@/components/admin/delete-dialog';
import { CrudFormDialog, CrudFormField, useCrudFormValues } from '@/components/admin/form-dialog';
import { DataPagination } from '@/components/common/DataPagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { MovieAdminInput } from '@/apis/movie.api';
import { adminCountries, adminGenres, adminMovies, adminPeoples } from '@/hooks/tankstack/admin';
import { useCrudPage } from '@/hooks/tankstack/admin-crud';
import { Movie } from '@/shared/types/movie.types';
import { getMovieTitle, getPosterUrl, getReleaseYear } from '@/shared/utils/movie';
import { z } from 'zod';

type MovieForm = Record<string, unknown>;

const schema = z.object({
  title: z.string().min(1, 'Tên phim là bắt buộc'),
  titleVi: z.string().optional(),
  releaseDate: z.string().max(20, 'Tối đa 20 ký tự').optional(),
  status: z.string().optional(),
  posterPath: z.string().optional(),
  backdropPath: z.string().optional(),
  overview: z.string().optional(),
  overviewVi: z.string().optional(),
  countryId: z.string().optional(),
  genreIds: z.array(z.string()),
  peopleIds: z.array(z.string()),
}) as unknown as z.ZodType<MovieForm>;

const STATIC_FIELDS: CrudFormField[] = [
  { name: 'title', label: 'Tên phim (gốc)', placeholder: 'vd. Parasite' },
  { name: 'titleVi', label: 'Tên phim (tiếng Việt)', placeholder: 'vd. Ký sinh trùng' },
  { name: 'releaseDate', label: 'Ngày phát hành', placeholder: 'YYYY-MM-DD' },
  { name: 'status', label: 'Trạng thái', placeholder: 'vd. Released' },
  { name: 'posterPath', label: 'Poster (path TMDB)', placeholder: '/abc.jpg' },
  { name: 'backdropPath', label: 'Backdrop (path TMDB)', placeholder: '/xyz.jpg' },
  { name: 'overview', label: 'Nội dung (tiếng Anh)', type: 'textarea', placeholder: 'Overview…' },
  { name: 'overviewVi', label: 'Nội dung (tiếng Việt)', type: 'textarea', placeholder: 'Nội dung…' },
];

const COLUMNS: DataTableColumn<Movie>[] = [
  {
    key: 'id',
    header: 'ID',
    className: 'w-20 text-muted-foreground',
    render: (movie) => movie.id,
  },
  {
    key: 'poster',
    header: 'Poster',
    className: 'w-16',
    hideOnMobile: true,
    render: (movie) => {
      const poster = getPosterUrl(movie.posterPath || movie.backdropPath);
      return poster ? (
        <Image
          src={poster}
          alt=""
          width={40}
          height={60}
          className="bg-muted h-15 w-10 rounded-md object-cover"
        />
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    },
  },
  {
    key: 'title',
    header: 'Tên phim',
    render: (movie) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{getMovieTitle(movie)}</p>
        {movie.titleVi && movie.titleVi !== movie.title ? (
          <p className="text-muted-foreground truncate text-xs">{movie.title}</p>
        ) : null}
      </div>
    ),
  },
  {
    key: 'releaseDate',
    header: 'Năm phát hành',
    render: (movie) => getReleaseYear(movie.releaseDate) || <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'viewCount',
    header: 'Lượt xem',
    className: 'w-28',
    render: (movie) => <span className="tabular-nums">{movie.viewCount ?? 0}</span>,
  },
];

/** CRUD Phim — form multiselect thể loại/người + select quốc gia (options nạp từ API chung). */
export function MoviesClient() {
  const mutations = {
    create: adminMovies.useCreate(),
    update: adminMovies.useUpdate(),
    remove: adminMovies.useDelete(),
  };
  const state = useCrudPage<Movie, MovieAdminInput>(mutations);
  const list = adminMovies.useList({ page: state.page, limit: 10, keyword: state.keyword });

  // Options cho form — đọc từ CRUD hooks dùng chung (không viết query riêng).
  const genres = adminGenres.useList({ page: 1, limit: 100 });
  const countries = adminCountries.useList({ page: 1, limit: 100 });
  const peoples = adminPeoples.useList({ page: 1, limit: 100 });

  const fields = useMemo<CrudFormField[]>(
    () => [
      ...STATIC_FIELDS,
      {
        name: 'countryId',
        label: 'Quốc gia',
        type: 'select',
        options: [
          { value: '', label: '— Chọn quốc gia —' },
          ...(countries.data?.items ?? []).map((country) => ({
            value: String(country.id),
            label: country.name,
          })),
        ],
      },
      {
        name: 'genreIds',
        label: 'Thể loại',
        type: 'multiselect',
        options: (genres.data?.items ?? []).map((genre) => ({
          value: String(genre.id),
          label: genre.name,
        })),
      },
      {
        name: 'peopleIds',
        label: 'Người tham gia',
        type: 'multiselect',
        options: (peoples.data?.items ?? []).map((people) => ({
          value: String(people.id),
          label: people.fullName ?? people.name ?? String(people.id),
        })),
      },
    ],
    [genres.data, countries.data, peoples.data],
  );

  const defaultValues = useCrudFormValues<MovieForm>(fields, state.editing);

  const handleSubmit = (values: MovieForm) => {
    const toNumberList = (value: unknown): number[] =>
      (Array.isArray(value) ? value : [])
        .map((entry) => Number(entry))
        .filter((entry) => !Number.isNaN(entry));

    state.submit({
      title: String(values.title ?? ''),
      titleVi: values.titleVi ? String(values.titleVi) : undefined,
      overview: values.overview ? String(values.overview) : undefined,
      overviewVi: values.overviewVi ? String(values.overviewVi) : undefined,
      releaseDate: values.releaseDate ? String(values.releaseDate) : undefined,
      posterPath: values.posterPath ? String(values.posterPath) : undefined,
      backdropPath: values.backdropPath ? String(values.backdropPath) : undefined,
      status: values.status ? String(values.status) : undefined,
      countryId: values.countryId ? Number(values.countryId) : undefined,
      genreIds: toNumberList(values.genreIds),
      peopleIds: toNumberList(values.peopleIds),
    });
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <CrudToolbar
        keyword={state.keywordInput}
        onKeywordChange={state.setKeywordInput}
        searchPlaceholder="Tìm phim…"
        onAdd={state.openCreate}
        addLabel="Thêm phim"
      />

      {list.isLoading ? (
        <CrudTableSkeleton />
      ) : list.isError ? (
        <ErrorState
          title="Không thể tải danh sách phim"
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={() => list.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            items={list.data?.items ?? []}
            rowKey={(movie) => movie.id}
            onEdit={state.openEdit}
            onDelete={(movie) => state.setDeleteTarget(movie)}
            empty={
              <EmptyState title="Không có phim nào" description="Thêm phim đầu tiên vào hệ thống." />
            }
          />
          {list.data ? (
            <DataPagination
              page={list.data.pagination.page}
              totalPages={list.data.pagination.totalPages}
              total={list.data.pagination.total}
              onPageChange={state.setPage}
              disabled={list.isFetching}
              ariaLabel="Phân trang phim"
            />
          ) : null}
        </>
      )}

      <CrudFormDialog
        open={state.dialogOpen}
        onOpenChange={state.setDialogOpen}
        title={state.editing ? 'Sửa phim' : 'Thêm phim'}
        schema={schema}
        fields={fields}
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        submitting={state.saving}
      />

      <CrudDeleteDialog
        target={
          state.deleteTarget
            ? { id: state.deleteTarget.id, label: getMovieTitle(state.deleteTarget) }
            : null
        }
        onCancel={() => state.setDeleteTarget(null)}
        onConfirm={state.confirmDelete}
        isPending={state.deleting}
        entityLabel="phim"
      />
    </div>
  );
}
