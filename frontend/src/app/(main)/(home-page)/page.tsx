import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <div className="flex items-center justify-center gap-4 px-8 py-4">
        <Link href='/dashboard' className="ms-auto px-4 py-2 rounded-lg bg-accent hover:bg-accent/60 transition-all cursor-pointer">Admin Home</Link>
        <Link href='/auth/login' className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/60 transition-all cursor-pointer">Login</Link>
        <Link href='/auth/signup' className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/60 transition-all cursor-pointer">Register</Link>
      </div>
      <h1 className="text-center text-red-500">Trang chủ</h1>
    </div>
  );
}