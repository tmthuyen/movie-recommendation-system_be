import { useRouter } from 'next/navigation';
import { FcGoogle } from 'react-icons/fc';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';

export default function LoginGoogle() {
  const router = useRouter();
  const handleGoogleLogin = () => {
    // window.location.assign(`${API_BASE_URL}/auth/google`);
    router.push(`${API_BASE_URL}/auth/google`);
  };
  return (
    <div className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
      <button
        className="flex w-full cursor-pointer items-center justify-center gap-2 px-8 py-2"
        onClick={handleGoogleLogin}
      >
        <p className="flex items-center justify-center gap-2">
          <FcGoogle className="h-6 w-6" />
        </p>
        Đăng nhập với Google
      </button>
    </div>
  );
}
