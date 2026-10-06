'use client';

import { AppSidebar } from '@/components/sidebar/app-sidebar';
import Header from '@/components/header/admin-header';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Bell, Flame, PlusCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import React from 'react';
import RequireRole from '@/components/auth/RequireRole';

function MainLayout({ children }: { children: React.ReactNode }) {
  const pathName = usePathname();
  return (
    <RequireRole requiredRoles={['ADMIN']}>
      {pathName === '/' ? (
        <>{children}</>
      ) : (
        <div className="flex min-h-screen w-full">
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-zinc-50">
              <Header className="bg-sidebar sticky top-0 right-0 left-0 z-10 flex h-16 shrink-0 items-center border-b px-4 shadow-lg backdrop-blur-md transition-all ease-linear md:px-8" />

              <div className="mx-auto flex w-full max-w-7xl flex-1 gap-4 px-4 pt-4 md:px-8 md:pt-8">
                {children}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </div>
      )}
    </RequireRole>
  );
}

export default MainLayout;
