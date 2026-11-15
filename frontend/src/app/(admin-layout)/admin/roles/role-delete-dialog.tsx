'use client';

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
import type { Role } from '@/shared/types/api.types';

export interface RoleDeleteDialogProps {
  role: Role | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
}

export function RoleDeleteDialog({
  role,
  open,
  onOpenChange,
  onConfirm,
  deleting,
}: RoleDeleteDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa vai trò?</AlertDialogTitle>
          <AlertDialogDescription>
            Vai trò <span className="text-foreground font-medium">{role?.name ?? 'này'}</span>
            {role?.code ? (
              <>
                {' '}
                (<span className="font-mono">{role.code}</span>)
              </>
            ) : null}{' '}
            sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.
          </AlertDialogDescription>
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
            {deleting ? 'Đang xóa…' : 'Xóa vai trò'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
