'use client';

import { AppSidebar } from '@/components/sidebar/app-sidebar';
import Header from '@/components/header/header';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Bell, Flame, PlusCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import React from 'react';

function MainLayout({ children }: { children: React.ReactNode }) {
  const pathName = usePathname();
  return pathName === '/' ? (
    <>{children}</>
  ) : (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header className="sticky top-0 right-0 left-0 z-10 flex h-16 shrink-0 items-center border-b px-4 shadow-sm transition-[width,height] ease-linear md:px-8" />

        <div className="flex flex-1 flex-col gap-4 px-4 pt-16 md:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default MainLayout;
