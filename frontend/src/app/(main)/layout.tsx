'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import UserLayout from '@/components/layout/UserLayout';
import { useAuthStore } from '@/stores/auth.store';
import RoleLayout from '@/components/layout/RoleLayout';

function MainLayout({ children }: { children: React.ReactNode }) {
  const pathName = usePathname();
  return pathName === '/' ? <>{children}</> : <RoleLayout>{children}</RoleLayout>;
}

export default MainLayout;
