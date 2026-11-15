'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { RoleInput } from '@/apis/role.api';
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
import { Textarea } from '@/components/ui/textarea';
import { parseAxiosError } from '@/lib/axiosClient';
import type { Role } from '@/shared/types/api.types';

/** Backend không giới hạn trong DTO; DB dùng varchar mặc định 255. */
const roleFormSchema = z.object({
  code: z.string().trim().min(1, 'Mã vai trò là bắt buộc').max(255, 'Mã vai trò tối đa 255 ký tự'),
  name: z
    .string()
    .trim()
    .min(1, 'Tên vai trò là bắt buộc')
    .max(255, 'Tên vai trò tối đa 255 ký tự'),
  description: z.string().trim().max(255, 'Mô tả tối đa 255 ký tự').optional(),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

export interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = tạo mới. */
  role: Role | null;
  onSubmit: (values: RoleInput) => Promise<void>;
  submitting: boolean;
}

export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  onSubmit,
  submitting,
}: RoleFormDialogProps) {
  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { code: '', name: '', description: '' },
  });

  const { reset, setError, handleSubmit, register, formState } = form;
  const { errors } = formState;

  useEffect(() => {
    if (!open) return;
    reset({
      code: role?.code ?? '',
      name: role?.name ?? '',
      description: role?.description ?? '',
    });
  }, [open, role, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit({
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
      });
    } catch (error) {
      const parsed = parseAxiosError(error);
      if (parsed.statusCode === 409) {
        setError('code', { type: 'server', message: parsed.message });
      } else {
        setError('root', { type: 'server', message: parsed.message });
      }
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? 'Sửa vai trò' : 'Thêm vai trò'}</DialogTitle>
          <DialogDescription>
            {role
              ? `Cập nhật thông tin cho vai trò ${role.name}.`
              : 'Tạo vai trò mới để phân quyền người dùng.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors.code)}>
              <FieldLabel htmlFor="role-code">
                Mã vai trò <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="role-code"
                {...register('code')}
                placeholder="VD: ADMIN"
                autoComplete="off"
                className="h-11 font-mono uppercase"
                aria-invalid={Boolean(errors.code)}
              />
              <FieldDescription>Mã được chuẩn hoá thành chữ in hoa khi lưu.</FieldDescription>
              <FieldError errors={[errors.code]} />
            </Field>

            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="role-name">
                Tên vai trò <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="role-name"
                {...register('name')}
                placeholder="VD: Quản trị viên"
                autoComplete="off"
                className="h-11"
                aria-invalid={Boolean(errors.name)}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="role-description">Mô tả</FieldLabel>
              <Textarea
                id="role-description"
                {...register('description')}
                placeholder="Mô tả ngắn về quyền hạn của vai trò (không bắt buộc)."
                rows={3}
                aria-invalid={Boolean(errors.description)}
              />
              <FieldError errors={[errors.description]} />
            </Field>
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
              className="h-11"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button type="submit" className="h-11" disabled={submitting}>
              {submitting ? 'Đang lưu…' : role ? 'Lưu thay đổi' : 'Tạo vai trò'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
