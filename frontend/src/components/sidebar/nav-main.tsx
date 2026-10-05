'use client';

import {
  BarChart2,
  BarChart4,
  Clock,
  ContactRound,
  Film,
  Flag,
  Gamepad,
  Heart,
  Home,
  List,
  ListCheck,
  MessageSquare,
  Palette,
  Star,
  Swords,
  Tag,
  UsersRound,
} from 'lucide-react';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const dataBar = {
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
  admin: {
    groupLabel: 'Administration',
    items: [
      {
        title: 'Tài khoản',
        url: '/admin/users',
        icon: ContactRound,
      },
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
        title: 'Đánh giá',
        url: '/interaction/ratings',
        icon: Star,
      },
      {
        title: 'Bình luận',
        url: '/interaction/comments',
        icon: MessageSquare,
      },
      {
        title: 'Yêu thích',
        url: '/interaction/favorites',
        icon: Heart,
      },
      {
        title: 'Lịch sử xem',
        url: '/interaction/history',
        icon: Clock,
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
    ],
  },
};

export function NavMain() {
  const pathname = usePathname();

  return (
    <div>
      <SidebarGroup>
        <SidebarGroupLabel>{dataBar.learning.groupLabel}</SidebarGroupLabel>
        <SidebarMenu>
          {dataBar.learning.items.map((it) => (
            <SidebarMenuItem key={it.title}>
              <SidebarMenuButton
                asChild
                className={`${pathname === it.url ? 'bg-accent text-accent-foreground dark:bg-accent/40' : ''
                  } hover:bg-accent/70 dark:hover:bg-accent/40 hover:text-accent-foreground cursor-pointer transition-transform hover:scale-105`}
              >
                <Link href={it.url}>
                  <it.icon />
                  <span>{it.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>{dataBar.admin.groupLabel}</SidebarGroupLabel>
        <SidebarMenu>
          {dataBar.admin.items.map((it) => (
            <SidebarMenuItem key={it.title}>
              <SidebarMenuButton
                asChild
                className={`${pathname === it.url ? 'bg-accent text-accent-foreground dark:bg-accent/40' : ''
                  } hover:bg-accent/70 dark:hover:bg-accent/40 hover:text-accent-foreground cursor-pointer transition-transform hover:scale-105`}
              >
                <Link href={it.url}>
                  <it.icon />
                  <span>{it.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>{dataBar.interaction.groupLabel}</SidebarGroupLabel>
        <SidebarMenu>
          {dataBar.interaction.items.map((it) => (
            <SidebarMenuItem key={it.title}>
              <SidebarMenuButton
                asChild
                className={`${pathname === it.url ? 'bg-accent text-accent-foreground dark:bg-accent/40' : ''
                  } hover:bg-accent/70 dark:hover:bg-accent/40 hover:text-accent-foreground cursor-pointer transition-transform hover:scale-105`}
              >
                <Link href={it.url}>
                  <it.icon />
                  <span>{it.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>{dataBar.settings.groupLabel}</SidebarGroupLabel>
        <SidebarMenu>
          {dataBar.settings.items.map((it) => (
            <SidebarMenuItem key={it.title}>
              <SidebarMenuButton
                asChild
                className={`${pathname === it.url ? 'bg-accent text-accent-foreground dark:bg-accent/40' : ''
                  } hover:bg-accent/70 dark:hover:bg-accent/40 hover:text-accent-foreground cursor-pointer transition-transform hover:scale-105`}
              >
                <Link href={it.url}>
                  <it.icon />
                  <span>{it.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </div>
  );
}
