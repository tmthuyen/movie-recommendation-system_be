'use client';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { Bell, Film, Home, LogIn, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ElementType } from 'react';

interface BottomNavItem {
  href: string;
  label: string;
  icon: ElementType;
  /** So khớp chặt chẽ (trang chủ) thay vì startsWith. */
  exact?: boolean;
}

function isActivePath(pathname: string, item: BottomNavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function BottomNavButton({ item, pathname }: { item: BottomNavItem; pathname: string }) {
  const active = isActivePath(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] transition-colors',
        active ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <item.icon className={cn('size-5', active && 'text-primary')} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Bottom navigation cho **màn hình nhỏ** (`< md`) — thay cho sidebar (sidebar trên
 * mobile chỉ mở tay qua Sheet, mặc định ẩn). Cố định đáy, chừa safe-area,
 * item active theo pathname.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  const items: BottomNavItem[] = [
    { href: '/', label: 'Trang chủ', icon: Home, exact: true },
    { href: '/movies', label: 'Phim', icon: Film },
    ...(user
      ? [{ href: '/notification', label: 'Thông báo', icon: Bell }]
      : []),
    user
      ? { href: '/profile', label: 'Tài khoản', icon: UserIcon }
      : { href: '/auth/login', label: 'Đăng nhập', icon: LogIn },
  ];

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed right-0 bottom-0 left-0 z-40 border-t bg-background/95 shadow-lg backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-md items-stretch">
        {items.map((item) => (
          <BottomNavButton key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}
