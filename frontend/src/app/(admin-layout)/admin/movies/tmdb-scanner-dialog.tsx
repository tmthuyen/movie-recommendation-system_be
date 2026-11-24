'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, CircleAlert, Clapperboard, Search, Star, X } from 'lucide-react';
import Image from 'next/image';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import type { TmdbDiscoverMode, TmdbDiscoverParams } from '@/apis/movie.api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { MotionItem, MotionStagger } from '@/components/motion/motion-primitives';
import {
  useTmdbDiscover,
  useTmdbGenreOptions,
  useTmdbImport,
  useTmdbLanguageOptions,
} from '@/hooks/tankstack/tmdb';
import { parseAxiosError } from '@/lib/axiosClient';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/shared/utils/formatting';
import { getPosterUrl } from './movie-poster';

/** Sentinel cho select “Tất cả” — Radix Select không nhận value="" cho item. */
const ALL = '__all__';
const MAX_YEAR = new Date().getFullYear() + 1;

const optionalDate = z
  .string()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Chọn ngày hợp lệ',
  });

const optionalYear = z
  .string()
  .refine((value) => value === '' || /^\d{4}$/.test(value), {
    message: 'Năm phải có 4 chữ số',
  })
  .refine((value) => value === '' || (Number(value) >= 1900 && Number(value) <= MAX_YEAR), {
    message: `Năm từ 1900 đến ${MAX_YEAR}`,
  });

const formSchema = z
  .object({
    mode: z.enum(['popularity', 'release-year']),
    page: z
      .string()
      .regex(/^\d+$/, 'Trang phải là số nguyên')
      .refine((value) => Number(value) >= 1, { message: 'Trang tối thiểu là 1' }),
    limit: z
      .string()
      .regex(/^\d+$/, 'Số lượng phải là số nguyên')
      .refine((value) => Number(value) >= 1 && Number(value) <= 100, {
        message: 'Số lượng từ 1 đến 100',
      }),
    releaseDateFrom: optionalDate,
    releaseDateTo: optionalDate,
    releaseYearFrom: optionalYear,
    releaseYearTo: optionalYear,
    genreId: z.string(),
    originalLanguage: z
      .string()
      .refine(
        (value) => value === ALL || (value.length >= 2 && value.length <= 10),
        'Mã ngôn ngữ từ 2 đến 10 ký tự',
      ),
  })
  .refine(
    (values) =>
      values.releaseDateFrom === '' ||
      values.releaseDateTo === '' ||
      values.releaseDateFrom <= values.releaseDateTo,
    { message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['releaseDateTo'] },
  )
  .refine(
    (values) =>
      values.releaseYearFrom === '' ||
      values.releaseYearTo === '' ||
      Number(values.releaseYearFrom) <= Number(values.releaseYearTo),
    { message: 'Năm bắt đầu phải trước năm kết thúc', path: ['releaseYearTo'] },
  );

type FilterFormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FilterFormValues = {
  mode: 'popularity',
  page: '1',
  limit: '20',
  releaseDateFrom: '',
  releaseDateTo: '',
  releaseYearFrom: '',
  releaseYearTo: '',
  genreId: ALL,
  originalLanguage: ALL,
};

function buildDiscoverParams(values: FilterFormValues): TmdbDiscoverParams {
  return {
    mode: values.mode as TmdbDiscoverMode,
    page: Number(values.page),
    limit: Number(values.limit),
    ...(values.releaseDateFrom ? { releaseDateFrom: values.releaseDateFrom } : {}),
    ...(values.releaseDateTo ? { releaseDateTo: values.releaseDateTo } : {}),
    ...(values.releaseYearFrom ? { releaseYearFrom: Number(values.releaseYearFrom) } : {}),
    ...(values.releaseYearTo ? { releaseYearTo: Number(values.releaseYearTo) } : {}),
    ...(values.genreId !== ALL ? { genreIds: [Number(values.genreId)] } : {}),
    ...(values.originalLanguage !== ALL ? { originalLanguage: values.originalLanguage } : {}),
  };
}

function CandidatePoster({
  posterPath,
  title,
}: {
  posterPath: string | null | undefined;
  title: string;
}) {
  const url = getPosterUrl(posterPath, 'w342');

  return (
    <div className="bg-muted relative aspect-[2/3] w-full overflow-hidden">
      {url ? (
        <Image
          src={url}
          alt={`Ảnh poster ${title}`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="text-muted-foreground/60 flex h-full w-full items-center justify-center">
          <Clapperboard className="size-10" aria-hidden />
        </div>
      )}
    </div>
  );
}

/** Dialog admin lấy phim mới từ TMDB qua backend — discover → chọn → import. */
export function TmdbScannerDialog() {
  const [open, setOpen] = useState(false);
  const [discoverParams, setDiscoverParams] = useState<TmdbDiscoverParams | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const formId = useId();

  const genresQuery = useTmdbGenreOptions(open);
  const languagesQuery = useTmdbLanguageOptions(open);
  const discoverQuery = useTmdbDiscover(discoverParams);
  const importMutation = useTmdbImport();

  const genreOptions = useMemo(
    () =>
      (genresQuery.data ?? []).map((genre) => ({
        value: String(genre.id),
        label: genre.name,
      })),
    [genresQuery.data],
  );

  const languageOptions = useMemo(
    () =>
      (languagesQuery.data ?? []).map((language) => ({
        value: language.code,
        label: language.name || language.englishName,
      })),
    [languagesQuery.data],
  );

  const resolver = useMemo(() => zodResolver(formSchema) as Resolver<FilterFormValues>, []);
  const form = useForm<FilterFormValues>({
    resolver,
    defaultValues: DEFAULT_VALUES,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });
  const { control, handleSubmit, register, setValue, formState } = form;
  const errors = formState.errors;
  const errorEntries = Object.entries(errors) as Array<
    [keyof FilterFormValues, { message?: string } | undefined]
  >;

  const fieldId = (name: keyof FilterFormValues) => `${formId}-${name}`;

  const submitFilters = (values: FilterFormValues) => {
    setSelectedIds(new Set());
    setDiscoverParams(buildDiscoverParams(values));
  };

  const focusErrorSummary = () => {
    requestAnimationFrame(() => document.getElementById(`${formId}-error-summary`)?.focus());
  };

  const goToPage = (page: number) => {
    setValue('page', String(page), { shouldValidate: true });
    void handleSubmit(submitFilters, focusErrorSummary)();
  };

  const candidates = discoverQuery.data?.items ?? [];
  const pagination = discoverQuery.data?.pagination;
  const hasSearched = discoverParams !== null;
  const allSelected = candidates.length > 0 && selectedIds.size === candidates.length;

  const toggleCandidate = (tmdbId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(tmdbId)) next.delete(tmdbId);
      else next.add(tmdbId);
      return next;
    });
  };

  const handleImport = () => {
    if (selectedIds.size === 0) return;
    importMutation.mutate(
      { tmdbIds: [...selectedIds] },
      {
        // Candidate đã import sẽ bị discover loại ở lần refetch — dọn selection ngay để không gửi lại ID cũ.
        onSuccess: () => setSelectedIds(new Set()),
      },
    );
  };

  const optionsLoading = genresQuery.isLoading || languagesQuery.isLoading;
  const optionsFailed = genresQuery.isError || languagesQuery.isError;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-11 cursor-pointer gap-2">
          <Search className="size-4" aria-hidden />
          Lấy phim từ TMDB
        </Button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
      >
        <DialogHeader className="border-b px-6 py-4 pr-16">
          <DialogTitle>Lấy phim từ TMDB</DialogTitle>
          <DialogDescription>
            Tìm phim mới chưa có trong thư viện. Dữ liệu được lấy qua backend của ứng dụng.
          </DialogDescription>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 size-11 cursor-pointer"
              aria-label="Đóng hộp thoại"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </DialogClose>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(submitFilters, focusErrorSummary)}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 px-6 py-4">
              {errorEntries.length > 0 ? (
                <Alert
                  id={`${formId}-error-summary`}
                  tabIndex={-1}
                  variant="destructive"
                  className="flex items-start gap-3"
                >
                  <CircleAlert className="size-4" aria-hidden />
                  <AlertDescription>
                    <p className="font-medium">Vui lòng kiểm tra bộ lọc:</p>
                    <ul className="mt-1 list-inside list-disc">
                      {errorEntries.map(([name, error]) => (
                        <li key={name}>
                          <a href={`#${fieldId(name)}`} className="underline underline-offset-2">
                            {error?.message}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              {optionsFailed ? (
                <Alert variant="destructive" className="flex items-start gap-3">
                  <CircleAlert className="size-4" aria-hidden />
                  <AlertDescription className="flex flex-wrap items-center gap-2">
                    <span>Không tải được bộ lọc từ TMDB.</span>
                    {genresQuery.isError ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11"
                        onClick={() => void genresQuery.refetch()}
                      >
                        Thử lại thể loại
                      </Button>
                    ) : null}
                    {languagesQuery.isError ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11"
                        onClick={() => void languagesQuery.refetch()}
                      >
                        Thử lại ngôn ngữ
                      </Button>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field data-invalid={Boolean(errors.mode)}>
                  <FieldLabel htmlFor={fieldId('mode')}>Chế độ tìm</FieldLabel>
                  <Controller
                    control={control}
                    name="mode"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger
                          id={fieldId('mode')}
                          className="h-11 w-full cursor-pointer"
                          aria-invalid={Boolean(errors.mode)}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="popularity" className="cursor-pointer">
                            Phổ biến
                          </SelectItem>
                          <SelectItem value="release-year" className="cursor-pointer">
                            Ngày phát hành
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.mode]} />
                </Field>

                <Field data-invalid={Boolean(errors.genreId)}>
                  <FieldLabel htmlFor={fieldId('genreId')}>Thể loại</FieldLabel>
                  <Controller
                    control={control}
                    name="genreId"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={genresQuery.isLoading}
                      >
                        <SelectTrigger
                          id={fieldId('genreId')}
                          className="h-11 w-full cursor-pointer"
                          aria-invalid={Boolean(errors.genreId)}
                        >
                          <SelectValue
                            placeholder={genresQuery.isLoading ? 'Đang tải…' : 'Tất cả thể loại'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL} className="cursor-pointer">
                            Tất cả thể loại
                          </SelectItem>
                          {genreOptions.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className="cursor-pointer"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.genreId]} />
                </Field>

                <Field data-invalid={Boolean(errors.originalLanguage)}>
                  <FieldLabel htmlFor={fieldId('originalLanguage')}>Ngôn ngữ gốc</FieldLabel>
                  <Controller
                    control={control}
                    name="originalLanguage"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={languagesQuery.isLoading}
                      >
                        <SelectTrigger
                          id={fieldId('originalLanguage')}
                          className="h-11 w-full cursor-pointer"
                          aria-invalid={Boolean(errors.originalLanguage)}
                        >
                          <SelectValue
                            placeholder={languagesQuery.isLoading ? 'Đang tải…' : 'Tất cả ngôn ngữ'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL} className="cursor-pointer">
                            Tất cả ngôn ngữ
                          </SelectItem>
                          {languageOptions.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className="cursor-pointer"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.originalLanguage]} />
                </Field>

                <Field data-invalid={Boolean(errors.page)}>
                  <FieldLabel htmlFor={fieldId('page')}>Trang</FieldLabel>
                  <Input
                    id={fieldId('page')}
                    type="number"
                    min={1}
                    className="h-11"
                    aria-invalid={Boolean(errors.page)}
                    {...register('page')}
                  />
                  <FieldError errors={[errors.page]} />
                </Field>

                <Field data-invalid={Boolean(errors.limit)}>
                  <FieldLabel htmlFor={fieldId('limit')}>Số phim / trang</FieldLabel>
                  <Input
                    id={fieldId('limit')}
                    type="number"
                    min={1}
                    max={100}
                    className="h-11"
                    aria-invalid={Boolean(errors.limit)}
                    {...register('limit')}
                  />
                  <FieldError errors={[errors.limit]} />
                </Field>

                <Field data-invalid={Boolean(errors.releaseDateFrom)}>
                  <FieldLabel htmlFor={fieldId('releaseDateFrom')}>Từ ngày</FieldLabel>
                  <Input
                    id={fieldId('releaseDateFrom')}
                    type="date"
                    className="h-11"
                    aria-invalid={Boolean(errors.releaseDateFrom)}
                    {...register('releaseDateFrom')}
                  />
                  <FieldError errors={[errors.releaseDateFrom]} />
                </Field>

                <Field data-invalid={Boolean(errors.releaseDateTo)}>
                  <FieldLabel htmlFor={fieldId('releaseDateTo')}>Đến ngày</FieldLabel>
                  <Input
                    id={fieldId('releaseDateTo')}
                    type="date"
                    className="h-11"
                    aria-invalid={Boolean(errors.releaseDateTo)}
                    {...register('releaseDateTo')}
                  />
                  <FieldError errors={[errors.releaseDateTo]} />
                </Field>

                <Field data-invalid={Boolean(errors.releaseYearFrom)}>
                  <FieldLabel htmlFor={fieldId('releaseYearFrom')}>Từ năm</FieldLabel>
                  <Input
                    id={fieldId('releaseYearFrom')}
                    type="number"
                    min={1900}
                    max={MAX_YEAR}
                    placeholder="VD: 2020"
                    className="h-11"
                    aria-invalid={Boolean(errors.releaseYearFrom)}
                    {...register('releaseYearFrom')}
                  />
                  <FieldError errors={[errors.releaseYearFrom]} />
                </Field>

                <Field data-invalid={Boolean(errors.releaseYearTo)}>
                  <FieldLabel htmlFor={fieldId('releaseYearTo')}>Đến năm</FieldLabel>
                  <Input
                    id={fieldId('releaseYearTo')}
                    type="number"
                    min={1900}
                    max={MAX_YEAR}
                    placeholder="VD: 2025"
                    className="h-11"
                    aria-invalid={Boolean(errors.releaseYearTo)}
                    {...register('releaseYearTo')}
                  />
                  <FieldError errors={[errors.releaseYearTo]} />
                </Field>
              </FieldGroup>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  className="h-11 cursor-pointer"
                  disabled={optionsLoading || discoverQuery.isFetching}
                >
                  <Search className="size-4" aria-hidden />
                  {discoverQuery.isFetching ? 'Đang tìm…' : 'Tìm phim'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 cursor-pointer"
                  onClick={() => {
                    form.reset(DEFAULT_VALUES);
                    setSelectedIds(new Set());
                    setDiscoverParams(null);
                  }}
                >
                  Đặt lại
                </Button>
              </div>
            </div>

            <Separator />

            <div className="px-6 py-4">
              {!hasSearched ? (
                <EmptyState
                  icon={Search}
                  title="Bắt đầu tìm phim"
                  description="Chọn bộ lọc rồi bấm “Tìm phim” để xem các phim mới chưa có trong thư viện."
                />
              ) : discoverQuery.isError ? (
                <ErrorState
                  title="Không tải được danh sách phim"
                  description={parseAxiosError(discoverQuery.error).message}
                  onRetry={() => void discoverQuery.refetch()}
                />
              ) : discoverQuery.isPending ? (
                <div
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  aria-busy="true"
                  aria-label="Đang tải danh sách phim từ TMDB"
                >
                  {Array.from({ length: 8 }).map((_, index) => (
                    <Card key={index} className="gap-0 overflow-hidden py-0">
                      <Skeleton className="aspect-[2/3] w-full rounded-none" />
                      <CardContent className="flex flex-col gap-2 p-3">
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-3 w-1/2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : candidates.length === 0 ? (
                <EmptyState
                  icon={Clapperboard}
                  title="Không có phim mới"
                  description="Thử đổi bộ lọc hoặc sang trang khác."
                />
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        Tìm thấy {pagination?.total ?? candidates.length} phim
                        {pagination?.totalPages
                          ? ` · trang ${pagination.page} / ${pagination.totalPages}`
                          : ''}
                      </p>
                      <Badge variant="secondary">Đã chọn {selectedIds.size}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11 cursor-pointer"
                        disabled={allSelected}
                        onClick={() =>
                          setSelectedIds(new Set(candidates.map((candidate) => candidate.tmdbId)))
                        }
                      >
                        Chọn tất cả
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11 cursor-pointer"
                        disabled={selectedIds.size === 0}
                        onClick={() => setSelectedIds(new Set())}
                      >
                        Bỏ chọn
                      </Button>
                    </div>
                  </div>

                  <MotionStagger
                    when="mount"
                    className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  >
                    {candidates.map((candidate) => {
                      const selected = selectedIds.has(candidate.tmdbId);
                      const displayTitle = candidate.titleVi || candidate.title;
                      const releaseYear = candidate.releaseDate?.slice(0, 4);

                      return (
                        <MotionItem key={candidate.tmdbId}>
                          <Card
                            className={cn(
                              'group relative gap-0 overflow-hidden py-0 transition-shadow hover:shadow-lg',
                              selected && 'ring-ring ring-2',
                            )}
                          >
                            <CandidatePoster
                              posterPath={candidate.posterPath}
                              title={displayTitle}
                            />
                            <Button
                              type="button"
                              variant={selected ? 'default' : 'outline'}
                              size="icon"
                              className="absolute top-2 right-2 size-11 rounded-full shadow-md"
                              aria-pressed={selected}
                              aria-label={
                                selected ? `Bỏ chọn ${displayTitle}` : `Chọn ${displayTitle}`
                              }
                              onClick={() => toggleCandidate(candidate.tmdbId)}
                            >
                              <Check className="size-5" aria-hidden />
                            </Button>
                            <CardContent className="flex flex-col gap-2 p-3">
                              <p className="line-clamp-2 text-sm font-medium" title={displayTitle}>
                                {displayTitle}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                {releaseYear ? (
                                  <Badge variant="outline">{releaseYear}</Badge>
                                ) : null}
                                {candidate.originalLanguage ? (
                                  <Badge variant="outline">{candidate.originalLanguage}</Badge>
                                ) : null}
                                {candidate.voteAverage ? (
                                  <span className="text-muted-foreground inline-flex items-center gap-1">
                                    <Star className="size-3 fill-current" aria-hidden />
                                    {candidate.voteAverage.toFixed(1)}
                                  </span>
                                ) : null}
                              </div>
                              {candidate.releaseDate ? (
                                <p className="text-muted-foreground text-xs">
                                  {formatShortDate(candidate.releaseDate)}
                                </p>
                              ) : null}
                              {candidate.genres.length > 0 ? (
                                <p className="text-muted-foreground line-clamp-1 text-xs">
                                  {candidate.genres.map((genre) => genre.name).join(', ')}
                                </p>
                              ) : null}
                              <p className="text-muted-foreground line-clamp-3 text-xs">
                                {candidate.overview}
                              </p>
                            </CardContent>
                          </Card>
                        </MotionItem>
                      );
                    })}
                  </MotionStagger>

                  {pagination && pagination.totalPages > 1 ? (
                    <div className="flex items-center justify-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 cursor-pointer"
                        disabled={pagination.page <= 1}
                        onClick={() => goToPage(pagination.page - 1)}
                      >
                        Trang trước
                      </Button>
                      <span className="text-muted-foreground text-sm">
                        {pagination.page} / {pagination.totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 cursor-pointer"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => goToPage(pagination.page + 1)}
                      >
                        Trang sau
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-11 cursor-pointer">
                Đóng
              </Button>
            </DialogClose>
            <Button
              type="button"
              className="h-11 cursor-pointer"
              disabled={selectedIds.size === 0 || importMutation.isPending}
              onClick={handleImport}
            >
              <Check className="size-4" aria-hidden />
              {importMutation.isPending ? 'Đang thêm…' : `Thêm ${selectedIds.size} phim đã chọn`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
