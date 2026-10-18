'use client';

import {
  Activity,
  BarChart4,
  Bell,
  Clock,
  ContactRound,
  Film,
  Flag,
  Heart,
  Home,
  Palette,
  Tag,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useAuthStore } from '@/stores/auth.store';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

interface NavSectionData {
  groupLabel: string;
  items: NavItem[];
}

const dataBar = {
  user: {
    groupLabel: 'Khám phá',
    items: [
      {
        title: 'Trang chủ',
        url: '/',
        icon: Home,
      },
      {
        title: 'Phim',
        url: '/movies',
        icon: Film,
      },
    ],
  },
  learning: {
    groupLabel: 'Dashboard',
    items: [
      {
        title: 'Dashboard',
        url: '/dashboard',
        icon: Home,
      },
    ],
  },
  auth: {
    groupLabel: 'Auth',
    items: [
      {
        title: 'Tài khoản',
        url: '/admin/users',
        icon: ContactRound,
      },
      {
        title: 'Vai trò',
        url: '/admin/roles',
        icon: BarChart4,
      },
    ],
  },
  admin: {
    groupLabel: 'Movie',
    items: [
      {
        title: 'Phim',
        url: '/admin/movies',
        icon: Film,
      },
      {
        title: 'Thể loại',
        url: '/admin/genres',
        icon: Tag,
      },
      {
        title: 'Quốc gia',
        url: '/admin/countries',
        icon: Flag,
      },
      {
        title: 'Diễn viên & đạo diễn',
        url: '/admin/people',
        icon: UsersRound,
      },
    ],
  },
  interaction: {
    groupLabel: 'Interaction',
    items: [
      {
        title: 'Tương tác',
        url: '/admin/interaction',
        icon: Activity,
      },
    ],
  },
  personal: {
    groupLabel: 'Cá nhân',
    items: [
      {
        title: 'Lịch sử xem',
        url: '/my-history',
        icon: Clock,
      },
      {
        title: 'Yêu thích',
        url: '/my-favorites',
        icon: Heart,
      },
    ],
  },
  settings: {
    groupLabel: 'Settings',
    items: [
      {
        title: 'Theme',
        url: '/setting/theme',
        icon: Palette,
      },
      {
        title: 'Hồ sơ',
        url: '/profile',
        icon: ContactRound,
      },
      {
        title: 'Thông báo',
        url: '/notification',
        icon: Bell,
      },
    ],
  },
} satisfies Record<string, NavSectionData>;

function isActivePath(pathname: string, url: string) {
  if (url === '/') return pathname === '/';
  return pathname === url || pathname.startsWith(`${url}/`);
}

function NavSection({ groupLabel, items }: NavSectionData) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const active = isActivePath(pathname, item.url);
          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                className={`${
                  active ? 'bg-accent text-accent-foreground dark:bg-accent/40' : ''
                } hover:bg-accent/70 dark:hover:bg-accent/40 hover:text-accent-foreground cursor-pointer transition-transform hover:scale-105`}
              >
                <Link href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function UserNavMain() {
  const user = useAuthStore((state) => state.user);

  return (
    <div>
      <NavSection groupLabel={dataBar.user.groupLabel} items={dataBar.user.items} />
      {user && (
        <NavSection groupLabel={dataBar.personal.groupLabel} items={dataBar.personal.items} />
      )}
      {user && (
        <NavSection groupLabel={dataBar.settings.groupLabel} items={dataBar.settings.items} />
      )}
    </div>
  );
}

export function NavMain() {
  return (
    <div>
      <NavSection groupLabel={dataBar.learning.groupLabel} items={dataBar.learning.items} />
      <NavSection groupLabel={dataBar.auth.groupLabel} items={dataBar.auth.items} />
      <NavSection groupLabel={dataBar.admin.groupLabel} items={dataBar.admin.items} />
      <NavSection groupLabel={dataBar.interaction.groupLabel} items={dataBar.interaction.items} />
      <NavSection groupLabel={dataBar.settings.groupLabel} items={dataBar.settings.items} />
    </div>
  );
}
