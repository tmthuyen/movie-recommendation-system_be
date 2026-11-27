'use client';

import { Pencil } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { User, UserProviderInfo } from '@/shared/types/api.types';
import { formatDateTime, formatShortDate } from '@/shared/utils/formatting';
import { mapUserStatus } from '@/shared/utils/mapStatus';

export interface UserDetailDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (user: User) => void;
}

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground min-w-0 truncate text-right font-medium" title={text}>
        {text}
      </span>
    </div>
  );
}

function providerLabel(entry: UserProviderInfo | string): string {
  const raw = typeof entry === 'string' ? entry : (entry.provider ?? '');
  const provider = raw.trim().toLowerCase();
  if (provider.includes('google')) return 'Google';
  if (provider.includes('local') || provider.includes('email')) {
    return 'Local (email / mật khẩu)';
  }
  return raw || 'Không xác định';
}

/**
 * Dialog xem chi tiết user cho admin — dùng dữ liệu row có sẵn (roles/providers
 * nếu backend trả về), không gọi thêm endpoint ngoài danh sách.
 */
export function UserDetailDialog({ user, open, onOpenChange, onEdit }: UserDetailDialogProps) {
  if (!user) return null;

  const status = mapUserStatus(user.status ?? 'UNKNOWN');
  const roles = user.roles ?? [];
  const providers = (user.providers ?? []).map(providerLabel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Chi tiết người dùng</DialogTitle>
          <DialogDescription>Hồ sơ, vai trò và nhà cung cấp đăng nhập.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-14 shrink-0">
              <AvatarImage src={user.avatarUrl} alt="" />
              <AvatarFallback>{initials(user.fullName ?? '') || '?'}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-foreground truncate font-semibold">{user.fullName}</p>
              <p className="text-muted-foreground truncate text-sm">{user.email}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className={status.color}>
                  {status.label}
                </Badge>
                <Badge variant={user.isVerified ? 'secondary' : 'outline'}>
                  {user.isVerified ? 'Đã xác thực' : 'Chưa xác thực'}
                </Badge>
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Thông tin hồ sơ</h3>
            <div className="bg-muted/40 flex flex-col gap-2 rounded-xl p-3">
              <InfoRow label="ID" value={user.id} />
              <InfoRow label="Email" value={user.email} />
              <InfoRow label="Số điện thoại" value={user.phoneNumber} />
              <InfoRow
                label="Ngày sinh"
                value={user.birthDate ? formatShortDate(user.birthDate) : undefined}
              />
              <InfoRow label="Giới tính" value={user.gender} />
              <InfoRow label="Địa chỉ" value={user.address} />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Vai trò</h3>
            {roles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {roles.map((role) => (
                  <Badge key={role.id} variant="secondary" className="font-mono text-[11px]">
                    {role.code}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Chưa có vai trò.</p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Nhà cung cấp đăng nhập</h3>
            {providers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {providers.map((provider, index) => (
                  <Badge key={`${provider}-${index}`} variant="outline">
                    {provider}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Chưa có dữ liệu nhà cung cấp.</p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Thời gian</h3>
            <div className="bg-muted/40 flex flex-col gap-2 rounded-xl p-3">
              <InfoRow label="Ngày tạo" value={formatDateTime(user.createdAt)} />
              <InfoRow label="Cập nhật lần cuối" value={formatDateTime(user.updatedAt)} />
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="h-11 cursor-pointer"
            onClick={() => onOpenChange(false)}
            aria-label="Đóng chi tiết người dùng"
          >
            Đóng
          </Button>
          {onEdit ? (
            <Button
              type="button"
              className="h-11 cursor-pointer gap-2"
              onClick={() => onEdit(user)}
              aria-label={`Sửa người dùng ${user.fullName}`}
            >
              <Pencil className="size-4" aria-hidden />
              Sửa người dùng
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
