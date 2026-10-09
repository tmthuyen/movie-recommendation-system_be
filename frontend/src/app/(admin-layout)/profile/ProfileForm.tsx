'use client';

import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Laptop,
  Smartphone,
  KeyRound,
  Shield,
  LogOut,
  CheckCircle2,
  User as UserIcon,
  Mail,
  Camera,
  Loader2,
  MapPin,
  Clock,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { userApi } from '@/apis/user.api';
import { authApi } from '@/apis/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { Role } from '@/shared/types/api.types';
import { mapUserStatus } from '@/shared/utils/mapStatus';
import { usePathname, useRouter } from 'next/navigation';
import { parseAxiosError } from '@/lib/axiosClient';
import UpdatePasswordForm from '@/app/(admin-layout)/profile/UpdatePasswordForm';
import dateTimeUtils from '@/shared/utils/formatting';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

// props
interface ProfileFormProps {
  metadata: {
    title: string;
    description: string;
  };
  children?: React.ReactNode;
}

export const ProfileForm = ({ metadata, children }: ProfileFormProps) => {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    useAuthStore.getState().refreshUser();
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/login?return-page=' + encodeURIComponent(pathname));
    }
  }, [user, router]);

  const [formData, setFormData] = useState({
    name: user?.fullName || '',
    email: user?.email || '',
  });

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const { data: sessionsData, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => authApi.getSessions(),
    staleTime: 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const sessions = React.useMemo(() => {
    if (!sessionsData?.result) return [];
    return sessionsData.result.reduce((acc: any[], session: any) => {
      const existingSession = acc.find((s) => s.userAgent === session.userAgent);
      if (!existingSession || !session.isRevoked) {
        acc.push(session);
      }
      return acc;
    }, []);
  }, [sessionsData]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await userApi.updateProfile({ fullName: formData.name });
      toast.success('Cập nhật thông tin thành công!', { position: 'top-right' });
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra', { position: 'top-right' });
    }
  };

  const handleRevokeSession = (sessionId: string) => {
    setSessionToRevoke(sessionId);
    setIsConfirmOpen(true);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file hình ảnh', { position: 'top-right' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Kích thước ảnh tối đa 5MB', { position: 'top-right' });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      await userApi.uploadAvatar(formData);
      // await refreshUser(); // Cập nhật lại context để lấy avatar mới
      toast.success('Cập nhật ảnh đại diện thành công!', { position: 'top-right' });
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra khi upload ảnh', {
        position: 'top-right',
      });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
    }
  };

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => authApi.logoutBySession({ sessionId }),
    onSuccess: () => {
      toast.success('Đăng xuất phiên thành công', { position: 'top-right' });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error) => {
      const axiosError = parseAxiosError(error, 'Lỗi khi đăng xuất phiên');
      toast.error(axiosError.message, { position: 'top-right' });
    },
  });

  const confirmRevoke = () => {
    if (sessionToRevoke !== null) {
      revokeSessionMutation.mutate(sessionToRevoke);
      setSessionToRevoke(null);
    }
    setIsConfirmOpen(false);
  };

  const status = mapUserStatus(user?.status || 'INACTIVE');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Cột trái: Thông tin cơ bản */}
      <div className="w-full space-y-6 lg:col-span-1">
        <Card className="w-full overflow-hidden border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div
            className={`relative flex items-center justify-center border-b border-gray-100 dark:border-slate-800`}
          >
            <div
              className="group mb2 flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gray-200 shadow-md dark:border-slate-900"
              onClick={handleAvatarClick}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div
                  className={`flex h-full w-full items-center justify-center text-3xl font-bold text-white uppercase`}
                >
                  {user?.fullName?.charAt(0) || 'U'}
                </div>
              )}

              {/* Overlay for uploading */}
              <div className="absolute inset-0 right-0 left-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                {isUploadingAvatar ? (
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
          <CardContent className="pt-0">
            <div className="mb-4 flex flex-col gap-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {user?.fullName || 'Người dùng ẩn danh'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-300">{user?.email}</p>
              <div className={`mt-2 flex items-center gap-2`}>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${status.color}`}>
                  {status.label}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                {user?.roles.map((role: Role) => (
                  <Badge
                    key={role.code}
                    variant={role.code === 'ADMIN' ? 'destructive' : 'default'}
                    className="text-sm uppercase"
                  >
                    {role.code}
                  </Badge>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleUpdateProfile}
              className="space-y-4 border-t border-gray-100 pt-4 dark:border-slate-800"
            >
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <UserIcon className="h-4 w-4" /> Tên hiển thị
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full text-base"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Mail className="h-4 w-4" /> Email đăng nhập
                </label>
                <Input
                  value={formData.email}
                  disabled
                  className="w-full bg-gray-50 text-base text-gray-500"
                />
                <p className="text-xs text-gray-400">Email không thể thay đổi sau khi đăng ký.</p>
              </div>
              <Button type="submit" className="w-full">
                Lưu Thay Đổi
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Cột phải: Bảo mật & Sessions */}
      <div className="space-y-6 lg:col-span-2">
        <UpdatePasswordForm />

        <Card className="border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <CardHeader className="bg-white pb-4 dark:bg-slate-900">
            <CardTitle className="flex items-center gap-2">
              <Shield className={`text-accent-foreground h-5 w-5`} /> Phiên Đăng Nhập
            </CardTitle>
            <CardDescription>
              Quản lý các thiết bị đang đăng nhập vào tài khoản của bạn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSessions ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 py-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {sessions.length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    Không có phiên đăng nhập nào.
                  </p>
                )}
                {sessions.map((session: any) => (
                  <div key={session.sessionId} className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={`rounded-full p-3 ${!session.isRevoked ? `text-accent` : 'bg-gray-100 text-gray-500 dark:bg-slate-900'}`}
                      >
                        {session.userAgent.includes('Mobile') ? (
                          <Smartphone className="h-8 w-8" />
                        ) : (
                          <Laptop className="h-8 w-8" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                          {session.userAgent}
                        </p>
                        <p className="flex items-center gap-2 text-sm text-gray-500">
                          <MapPin className="h-4 w-4" />
                          <span>{session.ip}</span>
                        </p>
                        <p
                          className={`flex items-center gap-2 text-sm ${session.isCurrentSession ? 'text-green-400' : 'text-gray-500'}`}
                        >
                          <Clock className="h-4 w-4" />{' '}
                          <span>{dateTimeUtils.formatDateTime(session.createdAt)}</span>
                          <span className="">
                            {session.isCurrentSession && ' (Thiết bị hiện tại)'}
                          </span>
                        </p>
                      </div>
                    </div>
                    {!session.isRevoked && !session.isCurrentSession && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRevokeSession(session.sessionId)}
                        className="text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                        title="Đăng xuất thiết bị này"
                      >
                        <LogOut className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Đăng xuất thiết bị"
        description="Bạn có chắc muốn đăng xuất khỏi thiết bị này?"
        onConfirm={confirmRevoke}
        onCancel={() => setIsConfirmOpen(false)}
        confirmText="Đăng xuất"
      />
    </div>
  );
};
