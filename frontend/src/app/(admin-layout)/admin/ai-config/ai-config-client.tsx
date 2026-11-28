'use client';

import { useEffect, useMemo } from 'react';
import { Controller, type FieldPath, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { CardListSkeleton } from '@/components/common/SkeletonLoader';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AI_CONFIG_QUERY_ROOT,
  useAdminAIConfig,
  useUpdateAIConfig,
} from '@/hooks/tankstack/admin-ai-config';
import type { AIConfigGroup, AIConfigItem, AIConfigValue } from '@/apis/ai-config.api';

const QUERY_ROOTS = [[AI_CONFIG_QUERY_ROOT]] as const;

interface FormValues {
  values: Record<string, string>;
}

function inputId(key: string) {
  return `ai-config-${key.replaceAll('.', '-')}`;
}

function toInputValue(item: AIConfigItem): string {
  if (item.value === null || item.value === undefined) return '';
  if (item.type === 'json') return JSON.stringify(item.value, null, 2);
  return String(item.value);
}

function buildInitialValues(groups: AIConfigGroup[]): Record<string, string> {
  return Object.fromEntries(
    groups
      .flatMap((group) => group.items)
      .map((item, index) => [String(index), toInputValue(item)]),
  );
}

function parseValue(item: AIConfigItem, raw: string): AIConfigValue {
  if (item.type === 'string') return raw;

  if (item.type === 'boolean') {
    return raw === 'true';
  }

  if (item.type === 'json') {
    if (!raw.trim()) throw new Error('JSON không được rỗng');
    return JSON.parse(raw) as AIConfigValue;
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) throw new Error('Giá trị phải là số');
  if (item.type === 'int' && !Number.isInteger(numeric)) {
    throw new Error('Giá trị phải là số nguyên');
  }
  if (item.min !== null && item.min !== undefined && numeric < item.min) {
    throw new Error(`Giá trị nhỏ nhất là ${item.min}`);
  }
  if (item.max !== null && item.max !== undefined && numeric > item.max) {
    throw new Error(`Giá trị lớn nhất là ${item.max}`);
  }
  return numeric;
}

function getPathValue(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

export function AIConfigClient() {
  const { data, isLoading, isError, refetch } = useAdminAIConfig();
  const updateMutation = useUpdateAIConfig();

  const form = useForm<FormValues>({
    defaultValues: { values: {} },
  });

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const itemIndexByKey = useMemo(
    () => new Map(allItems.map((item, index) => [item.key, index])),
    [allItems],
  );
  useEffect(() => {
    if (!data) return;
    form.reset({ values: buildInitialValues(data.groups) });
  }, [data, form]);

  const changedIndexes = allItems
    .map((_, index) => index)
    .filter((index) =>
      Boolean(getPathValue(form.formState.dirtyFields, ['values', String(index)])),
    );

  const handleSave = form.handleSubmit(async (values) => {
    const changes: Record<string, AIConfigValue> = {};
    let hasError = false;

    for (const index of changedIndexes) {
      const item = allItems[index];
      const key = item.key;

      try {
        changes[key] = parseValue(item, values.values[String(index)] ?? '');
      } catch (error) {
        hasError = true;
        form.setError(`values.${index}` as FieldPath<FormValues>, {
          type: 'manual',
          message: error instanceof Error ? error.message : 'Giá trị không hợp lệ',
        });
      }
    }

    if (hasError) return;
    if (!Object.keys(changes).length) {
      toast.info('Không có thay đổi để lưu.');
      return;
    }

    updateMutation.mutate(changes);
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <AdminPageHeader
          title="Cấu hình AI"
          description="Trọng số gợi ý và tham số huấn luyện AI."
          queryRoots={QUERY_ROOTS}
        />
        <CardListSkeleton count={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <AdminPageHeader
          title="Cấu hình AI"
          description="Trọng số gợi ý và tham số huấn luyện AI."
          queryRoots={QUERY_ROOTS}
        />
        <ErrorState
          title="Không tải được cấu hình AI"
          description="Kiểm tra kết nối AI-service hoặc quyền ADMIN rồi thử lại."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <AdminPageHeader
          title="Cấu hình AI"
          description="Trọng số gợi ý và tham số huấn luyện AI."
          queryRoots={QUERY_ROOTS}
        />
        <EmptyState
          title="Chưa có cấu hình AI"
          description="AI-service chưa trả về nhóm cấu hình nào."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <AdminPageHeader
        title="Cấu hình AI"
        description="Trọng số gợi ý và tham số huấn luyện AI. Thay đổi được lưu vào Redis."
        queryRoots={QUERY_ROOTS}
        actions={
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!changedIndexes.length || updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Phiên bản {data?.version ?? 0}</Badge>
        <Badge variant="outline">{changedIndexes.length} thay đổi chưa lưu</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.group}>
            <CardHeader>
              <CardTitle className="text-base">{group.label}</CardTitle>
              <CardDescription className="font-mono text-xs">{group.group}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {group.items.map((item) => {
                const index = itemIndexByKey.get(item.key) ?? 0;
                const fieldName = `values.${index}` as FieldPath<FormValues>;
                const error = getPathValue(form.formState.errors, ['values', String(index)]) as
                  { message?: string } | undefined;

                return (
                  <div key={item.key} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor={inputId(item.key)}>{item.label}</Label>
                      <Badge
                        variant={item.source === 'redis' ? 'default' : 'outline'}
                        className="text-[10px]"
                      >
                        {item.source === 'redis' ? 'Redis' : 'Mặc định'}
                      </Badge>
                    </div>

                    {item.description ? (
                      <p className="text-muted-foreground text-xs">{item.description}</p>
                    ) : null}

                    <Controller
                      control={form.control}
                      name={fieldName}
                      render={({ field }) => {
                        if (item.type === 'boolean') {
                          return (
                            <Select
                              value={String(field.value ?? 'false')}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger id={inputId(item.key)} aria-label={item.label}>
                                <SelectValue placeholder="Chọn giá trị" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Bật</SelectItem>
                                <SelectItem value="false">Tắt</SelectItem>
                              </SelectContent>
                            </Select>
                          );
                        }

                        if (item.type === 'json') {
                          return (
                            <Textarea
                              id={inputId(item.key)}
                              aria-label={item.label}
                              rows={5}
                              className="font-mono text-xs"
                              {...field}
                              value={String(field.value ?? '')}
                            />
                          );
                        }

                        return (
                          <Input
                            id={inputId(item.key)}
                            aria-label={item.label}
                            type={item.type === 'string' ? 'text' : 'number'}
                            step={item.type === 'int' ? '1' : 'any'}
                            min={item.min ?? undefined}
                            max={item.max ?? undefined}
                            {...field}
                            value={String(field.value ?? '')}
                          />
                        );
                      }}
                    />

                    {error?.message ? (
                      <p className="text-destructive text-xs">{error.message}</p>
                    ) : null}

                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
                      <span className="break-all">{item.key}</span>
                      <span>Mặc định: {String(item.default)}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
