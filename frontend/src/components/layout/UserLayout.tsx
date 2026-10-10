'use client';

import { AdminSidebar } from '@/components/sidebar/admin-sidebar';
import Header from '@/components/header/admin-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import React from 'react';
import { UserSidebar } from '@/components/sidebar/user-sidebar';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <UserSidebar />
      <SidebarInset className="bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-zinc-50">
        <Header className="bg-sidebar sticky top-0 right-0 left-0 z-10 flex h-16 shrink-0 items-center border-b px-4 shadow-lg backdrop-blur-md transition-all ease-linear md:px-8" />

        <div className="mx-auto flex w-full max-w-7xl flex-1 gap-4 px-4 pt-4 md:px-8 md:pt-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
