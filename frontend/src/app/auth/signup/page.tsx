import { Metadata } from 'next';
import SignUpForm from './signup-form';

export const metadata: Metadata = {
  title: 'Sign Up - Movie Recommendation',
  description: 'Create a new account for your movie recommendation',
};

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <SignUpForm />
    </div>
  );
}
