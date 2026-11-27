'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { countryApi } from '@/apis/country.api';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminDeleteDialog } from '@/components/admin/data-view/admin-delete-dialog';
import { AdminFormDialog } from '@/components/admin/data-view/admin-form-dialog';
import type {
  AdminFormField,
  AdminFormValues,
} from '@/components/admin/data-view/admin-form-schema';
import { AdminTablePage } from '@/components/admin/data-view/admin-table-page';
import { adminCountries } from '@/hooks/tankstack/admin';
import { useServerTable } from '@/hooks/use-server-table';
import { parseAxiosError } from '@/lib/axiosClient';
import type { Country } from '@/shared/types/movie.types';
import { COUNTRY_FILTER_FIELDS } from './country-filter-fields';
import { createCountryColumns } from './countries-columns';

const EMPTY_COUNTRIES: Country[] = [];
const DEFAULT_SORTING = [{ id: 'viName', desc: false }];

const COUNTRY_FORM_FIELDS: AdminFormField[] = [
  {
    name: 'viName',
    label: 'Tên (tiếng Việt)',
    required: true,
    maxLength: 50,
    placeholder: 'VD: Việt Nam',
  },
  {
    name: 'enName',
    label: 'Tên (tiếng Anh)',
    required: true,
    maxLength: 50,
    placeholder: 'VD: Vietnam',
  },
  {
    name: 'code',
    label: 'Mã quốc gia',
    required: true,
    maxLength: 2,
    placeholder: 'VD: VN',
  },
  {
    name: 'region',
    label: 'Khu vực',
    required: true,
    maxLength: 50,
    placeholder: 'VD: Asia',
  },
];

interface CountriesClientProps {
  title?: string;
  description?: string;
}

export function CountriesClient({
  title = 'Quốc gia',
  description = 'Quản lý quốc gia xuất xứ của phim',
}: CountriesClientProps = {}) {
  const table = useServerTable({
    initialPageSize: 10,
    initialSorting: DEFAULT_SORTING,
  });
  const { clampPageIndex } = table;

  const countriesQuery = useQuery({
    queryKey: ['admin-countries', 'list', table.params],
    queryFn: () => countryApi.getAll(table.params),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const countries = countriesQuery.data?.result ?? EMPTY_COUNTRIES;
  const total = countriesQuery.data?.pagination?.total ?? 0;

  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  const createCountry = adminCountries.useCreate();
  const updateCountry = adminCountries.useUpdate();
  const deleteCountry = adminCountries.useDelete();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Country | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Country | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const columns = useMemo(
    () =>
      createCountryColumns({
        onEdit: (country) => {
          setEditing(country);
          setFormOpen(true);
        },
        onDelete: (country) => setDeleteTarget(country),
      }),
    [],
  );

  const defaultValues = useMemo<AdminFormValues>(
    () => ({
      viName: editing?.viName ?? '',
      enName: editing?.enName ?? '',
      code: editing?.code ?? '',
      region: editing?.region ?? '',
    }),
    [editing],
  );

  const handleSubmit = async (values: AdminFormValues) => {
    const input = {
      viName: String(values.viName ?? '').trim(),
      enName: String(values.enName ?? '').trim(),
      code: String(values.code ?? '')
        .trim()
        .toUpperCase(),
      region: String(values.region ?? '').trim(),
    };

    if (editing) {
      await updateCountry.mutateAsync({ id: editing.id, data: input });
    } else {
      await createCountry.mutateAsync(input);
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCountry.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <AdminPageHeader title={title} description={description} queryRoots={[['admin-countries']]} />
      <AdminTablePage
        table={table}
        columns={columns}
        data={countries}
        total={total}
        isLoading={countriesQuery.isLoading}
        isFetching={countriesQuery.isFetching}
        error={countriesQuery.error}
        onRetry={() => void countriesQuery.refetch()}
        searchPlaceholder="Tìm theo tên hoặc mã quốc gia…"
        searchLabel="Tìm kiếm quốc gia"
        filterFields={COUNTRY_FILTER_FIELDS}
        entityLabel="quốc gia"
        emptyDescription="Thêm quốc gia đầu tiên để gắn vào phim."
        addLabel="Thêm quốc gia"
        onAdd={openCreate}
      >
        <AdminFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          title={editing ? 'Sửa quốc gia' : 'Thêm quốc gia'}
          description={
            editing ? 'Cập nhật thông tin quốc gia đang chọn.' : 'Tạo quốc gia mới để gắn vào phim.'
          }
          fields={COUNTRY_FORM_FIELDS}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          submitting={createCountry.isPending || updateCountry.isPending}
          submitLabel={editing ? 'Lưu thay đổi' : 'Thêm quốc gia'}
          mapServerError={(error) =>
            parseAxiosError(error).statusCode === 409
              ? { field: 'code', message: 'Tên hoặc mã quốc gia đã tồn tại' }
              : null
          }
        />

        <AdminDeleteDialog
          open={deleteTarget !== null}
          onOpenChange={(next) => {
            if (!next) setDeleteTarget(null);
          }}
          title="Xóa quốc gia?"
          description={
            <>
              Quốc gia{' '}
              <span className="text-foreground font-medium">{deleteTarget?.viName ?? 'này'}</span>{' '}
              sẽ bị xóa khỏi tất cả phim liên quan. Hành động này không thể hoàn tác.
            </>
          }
          onConfirm={handleDelete}
          deleting={deleteCountry.isPending}
        />
      </AdminTablePage>
    </div>
  );
}
