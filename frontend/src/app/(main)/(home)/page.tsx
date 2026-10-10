'use client';

import UserDropdown from '@/components/dropdown/user-dropdown';
import { useAuthStore } from '@/stores/auth.store';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div>
      <div className="flex items-center justify-end gap-4 px-8 py-4">
        <UserDropdown />
      </div>
      <h1 className="text-center text-red-500">Trang chủ</h1>
    </div>
  );
}
