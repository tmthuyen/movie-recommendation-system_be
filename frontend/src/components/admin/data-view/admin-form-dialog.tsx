'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useMemo, useRef } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { parseAxiosError } from '@/lib/axiosClient';
import {
  buildAdminFormSchema,
  type AdminFormDirtyFields,
  type AdminFormField,
  type AdminFormValues,
} from './admin-form-schema';
import { MultiSelectField } from './multi-select-field';

export type { AdminFormDirtyFields };

export interface AdminFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: AdminFormField[];
  defaultValues: AdminFormValues;
  onSubmit: (values: AdminFormValues, dirtyFields: AdminFormDirtyFields) => Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
  /** Map lỗi server về field cụ thể (vd. 409 → `code`); trả `null` để hiện lỗi chung. */
  mapServerError?: (error: unknown) => { field: string; message: string } | null;
}

/**
 * Dialog thêm/sửa dùng chung cho mọi trang admin: cấu hình `fields` →
 * tự sinh schema zod + render control + hiển thị lỗi inline.
 * Hỗ trợ text/textarea/number/date/select/multiselect.
 */
export function AdminFormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  defaultValues,
  onSubmit,
  submitting = false,
  submitLabel,
  mapServerError,
}: AdminFormDialogProps) {
  const formId = useId();
  const schema = useMemo(() => buildAdminFormSchema(fields), [fields]);
  const resolver = useMemo(() => zodResolver(schema) as Resolver<AdminFormValues>, [schema]);

  const form = useForm<AdminFormValues>({ resolver, defaultValues });
  const { control, register, handleSubmit, reset, setError, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  // Chỉ reset khi mở dialog — tránh mất dữ liệu đang nhập nếu defaultValues
  // là object mới mỗi render ở trang cha. Ref được cập nhật trong effect
  // (không ghi `ref.current` khi render) và chạy trước effect reset bên dưới.
  const defaultsRef = useRef(defaultValues);

  useEffect(() => {
    defaultsRef.current = defaultValues;
  }, [defaultValues]);

  useEffect(() => {
    if (open) reset(defaultsRef.current);
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      // Field chưa từng thay đổi không được đưa vào payload PATCH/PUT.
      await onSubmit(values, formState.dirtyFields as AdminFormDirtyFields);
    } catch (error) {
      const mapped = mapServerError?.(error);
      if (mapped) {
        setError(mapped.field, { type: 'server', message: mapped.message });
        return;
      }
      setError('root', { type: 'server', message: parseAxiosError(error).message });
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((field) => {
              const type = field.type ?? 'text';
              const id = `${formId}-${field.name}`;
              const invalid = Boolean(errors[field.name]);
              const error = errors[field.name];

              return (
                <Field
                  key={field.name}
                  data-invalid={invalid}
                  className={field.wide || type === 'textarea' ? 'sm:col-span-2' : undefined}
                >
                  <FieldLabel htmlFor={id}>
                    {field.label}
                    {field.required ? <span className="text-destructive"> *</span> : null}
                  </FieldLabel>

                  {type === 'textarea' ? (
                    <Textarea
                      id={id}
                      {...register(field.name)}
                      placeholder={field.placeholder}
                      rows={3}
                      maxLength={field.maxLength}
                      aria-invalid={invalid}
                    />
                  ) : type === 'select' ? (
                    <Controller
                      control={control}
                      name={field.name}
                      render={({ field: controlled }) => (
                        <Select
                          value={
                            typeof controlled.value === 'string' && controlled.value
                              ? controlled.value
                              : undefined
                          }
                          onValueChange={controlled.onChange}
                          disabled={submitting}
                        >
                          <SelectTrigger
                            id={id}
                            className="h-11 w-full cursor-pointer"
                            aria-invalid={invalid}
                          >
                            <SelectValue placeholder={field.placeholder ?? 'Chọn…'} />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options ?? []).map((option) => (
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
                  ) : type === 'multiselect' ? (
                    <Controller
                      control={control}
                      name={field.name}
                      render={({ field: controlled }) => (
                        <MultiSelectField
                          id={id}
                          options={field.options ?? []}
                          value={
                            Array.isArray(controlled.value) ? (controlled.value as string[]) : []
                          }
                          onChange={controlled.onChange}
                          placeholder={field.placeholder}
                          disabled={submitting}
                          invalid={invalid}
                        />
                      )}
                    />
                  ) : (
                    <Input
                      id={id}
                      type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                      inputMode={type === 'number' ? 'decimal' : undefined}
                      step={type === 'number' ? (field.step ?? 'any') : undefined}
                      min={type === 'number' ? field.min : undefined}
                      max={type === 'number' ? field.max : undefined}
                      {...register(field.name)}
                      placeholder={field.placeholder}
                      maxLength={field.maxLength}
                      autoComplete="off"
                      className="h-11"
                      aria-invalid={invalid}
                    />
                  )}

                  {field.description ? (
                    <FieldDescription>{field.description}</FieldDescription>
                  ) : null}
                  <FieldError errors={[error]} />
                </Field>
              );
            })}
          </FieldGroup>

          {errors.root?.message ? (
            <p className="text-destructive text-sm" role="alert">
              {errors.root.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11 cursor-pointer"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button type="submit" className="h-11 cursor-pointer" disabled={submitting}>
              {submitting ? 'Đang lưu…' : (submitLabel ?? 'Lưu')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
