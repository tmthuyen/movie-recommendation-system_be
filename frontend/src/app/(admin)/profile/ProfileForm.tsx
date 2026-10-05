'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import * as z from 'zod';
import { formatDateTime } from '@/shared/utils/formatting';
import Image from 'next/image';
import { ProfileDTO } from '@/shared/types/user.types';

export const profileFormSchema = z
  .object({
    full_name: z.string().min(2, 'Tên phải có ít nhất 2 ký tự').max(100),
    target_band: z.number().int().positive().optional(),
    avatar_url: z.string().optional(),
    vip_plan: z.string().optional(),
    vip_expired_at: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    role_codes: z.array(z.string()).optional(),
  })
  .strict();

export type ProfileFormData = z.infer<typeof profileFormSchema>;

export function EditProfileForm({ profile }: { profile: ProfileDTO | null }) {
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      avatar_url: profile?.avatar_url ?? '',
      target_band: profile?.target_band ?? undefined,
      vip_plan: profile?.vip_plan ?? '',
      vip_expired_at: profile?.vip_expired_at ?? '',
      created_at: profile?.created_at ?? '',
      updated_at: profile?.updated_at ?? '',
      role_codes: profile?.role_codes ?? [],
    },
  });

  async function onSubmit(data: ProfileFormData) {
    try {
      setIsLoading(true);
      const response = await fetch('/api/profile/update', {
        method: 'PUT',
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Cập nhật thất bại');

      toast.success('✅ Cập nhật thành công!');
    } catch (error) {
      toast.error('❌ Lỗi: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full sm:max-w-2xl">
      <CardHeader>
        <CardTitle>Chỉnh Sửa Hồ Sơ</CardTitle>
        <CardDescription>Cập nhật thông tin cá nhân của bạn</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="mb-6 flex flex-col items-center gap-4">
          {profile?.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.full_name || 'Avatar'}
              width={96}
              height={96}
              className="border-primary rounded-full border-4 object-cover shadow-lg"
            />
          ) : (
            <div className="bg-muted border-primary flex h-24 w-24 items-center justify-center rounded-full border-4">
              <span className="text-muted-foreground text-2xl">👤</span>
            </div>
          )}
        </div>
        <form id="profile-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            {/* ============ Họ Tên ============ */}
            <Controller
              name="full_name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Họ và Tên</FieldLabel>
                  <Input
                    {...field}
                    placeholder="Trần Minh Thuyên"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {/* ============ Avatar URL ============ */}
            <Controller
              name="avatar_url"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Avatar URL</FieldLabel>
                  <Input
                    {...field}
                    type="text"
                    placeholder="https://example.com/avatar"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {/* ============ Target band ============ */}
            <Controller
              name="target_band"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Target Band</FieldLabel>
                  <Input
                    {...field}
                    type="number"
                    placeholder="Target Band (e.g., 7.5)"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {/* ============ VIP Plan ============ */}
            <Controller
              name="vip_plan"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Plan VIP</FieldLabel>
                  <Input
                    {...field}
                    type="text"
                    placeholder="Plan VIP"
                    disabled
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {/* ============ VIP expires ============ */}
            <Controller
              name="vip_expired_at"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Plan VIP Expires At</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ? formatDateTime(field.value) : ''}
                    type="text"
                    disabled
                    placeholder="Plan VIP Expires At"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {/* ============ Created At ============ */}
            <Controller
              name="created_at"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Created At</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ? formatDateTime(field.value) : ''}
                    type="text"
                    disabled
                    placeholder="Created At"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {/* ============ Updated At ============ */}
            <Controller
              name="updated_at"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Updated At</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ? formatDateTime(field.value) : ''}
                    type="text"
                    disabled
                    placeholder="Updated At"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {/* ============ Role codes ============ */}
            <Controller
              name="role_codes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Role Codes</FieldLabel>
                  <Input
                    {...field}
                    value={Array.isArray(field.value) ? field.value.join(', ') : ''}
                    type="text"
                    disabled
                    placeholder="Role Codes (comma separated)"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => form.reset()}>
          Hủy
        </Button>
        <Button type="submit" form="profile-form" disabled={isLoading}>
          {isLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
        </Button>
      </CardFooter>
    </Card>
  );
}
