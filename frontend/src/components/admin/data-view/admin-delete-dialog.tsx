'use client';

import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface AdminDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Nội dung mô tả — nên nêu rõ bản ghi sẽ bị xoá. */
  description: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  deleting?: boolean;
}

/**
 * Dialog xác nhận xoá dùng chung: nút xác nhận luôn `destructive` (đỏ).
 * Dùng `variant` thay vì className vì Radix `Slot` cộng dồn class
 * (`bg-primary` thắng theo thứ tự CSS).
 */
export function AdminDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = 'Xóa',
  deleting = false,
}: AdminDeleteDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11 cursor-pointer" disabled={deleting}>
            Hủy
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="h-11 cursor-pointer"
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {deleting ? 'Đang xóa…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
