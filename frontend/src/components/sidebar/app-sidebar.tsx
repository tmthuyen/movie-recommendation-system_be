'use client';

import * as React from 'react';

import { NavMain } from '@/components/sidebar/nav-main';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';
import { NavUser } from './nav-user';
import Image from 'next/image';
import Link from 'next/link';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="flex h-16 items-start justify-center border-b shadow-sm">
        <Link href="/home" className="flex min-h-16 w-full items-center justify-start">
          <Image width={140} height={70} src="/logo.png" alt="Logo" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
      </SidebarContent>
      <SidebarFooter className="mb-2">
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
