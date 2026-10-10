import { Metadata } from 'next';
import VerifyEmail from '@/app/auth/verify-email/verify-email';

export const metadata: Metadata = {
  title: 'Xác thực email',
  description: 'Xác thực email | Movie Recommendation App',
};

export default function Page() {
  console.log('VerifyEmail component rendered');
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <VerifyEmail />
    </div>
  );
}
