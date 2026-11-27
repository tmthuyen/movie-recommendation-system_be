'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const REASON_MESSAGES: Record<string, string> = {
  'google-access-denied': 'Bạn đã hủy đăng nhập Google.',
  'google-login-failed': 'Đăng nhập Google thất bại. Vui lòng thử lại.',
  'google-provider-conflict': 'Tài khoản Google đang liên kết với tài khoản khác.',
  'google-profile-no-email': 'Không lấy được email từ tài khoản Google.',
};

function GoogleFailedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason') || 'google-login-failed';
  const message = REASON_MESSAGES[reason] ?? REASON_MESSAGES['google-login-failed'];

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="flex w-full max-w-md flex-col gap-5 rounded-2xl border p-6 text-center shadow-lg">
        <h1 className="text-xl font-semibold">Đăng nhập Google thất bại</h1>
        <p className="text-muted-foreground text-sm">{message}</p>
        <div className="flex gap-2">
          <Button asChild className="h-11 flex-1 cursor-pointer">
            <Link href="/auth/login">Đăng nhập thường</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 flex-1 cursor-pointer">
            <Link href="/">Về trang chủ</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function GoogleFailedPage() {
  return (
    <Suspense fallback={null}>
      <GoogleFailedContent />
    </Suspense>
  );
}
