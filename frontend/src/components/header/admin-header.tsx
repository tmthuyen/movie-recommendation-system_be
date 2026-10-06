'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { Home, Moon, Sun } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';

function AdminHeader({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  return (
    <header className={className}>
      <div className="flex w-full items-center gap-4">
        <SidebarTrigger className="ms-auto -ml-1 cursor-pointer" />

        <Link
          href="/"
          className="bg-accent hover:bg-accent/60 ms-auto cursor-pointer rounded-lg px-2 py-2 transition-all"
        >
          <Home />
        </Link>

        {/* Toggle theme */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="cursor-pointer rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
          title="Đổi giao diện Sáng/Tối"
        >
          {!mounted ? (
            <div className="h-5 w-5 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
          ) : theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        {/* Notification */}

        {/* Account dropdown */}
      </div>
    </header>
  );
}

export default AdminHeader;
