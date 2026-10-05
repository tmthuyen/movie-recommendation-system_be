'use client';

import { SidebarTrigger } from "@/components/ui/sidebar";
import Link from "next/link";



function Header({ className }: { className?: string }) {
  return (
    <header className={className}>
      <div className="flex w-full items-center">
        <SidebarTrigger className="-ml-1 cursor-pointer" />

        <h2 className="ms-6 text-xl font-bold">Admin header</h2>

        <Link href="/" className="ms-auto px-4 py-2 rounded-lg bg-accent hover:bg-accent/60 transition-all cursor-pointer">
          Trang chủ
        </Link>

      </div>
    </header>
  );
}

export default Header;
