'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';
import z from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

const loginEmailPasswordSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

function LoginForm() {
  const [mounted, setMounted] = useState(false);

  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginForm = useForm<z.infer<typeof loginEmailPasswordSchema>>({
    resolver: zodResolver(loginEmailPasswordSchema),
    mode: 'onChange',
    defaultValues: {
      email: 'admin@gmail.com',
      password: '123456',
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="m-auto text-center text-lg">Loading...</div>;
  }

  const {
    control,
    reset,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = loginForm;

  const onSubmit = async (data: z.infer<typeof loginEmailPasswordSchema>) => {
    // setError(null);
    // const { email, password } = data;

    // // const res = await login({ email, password });
    // if (!res.success) {
    //   const errorMessage = res.message || 'Failed to sign in';
    //   const errorDetails = res.details ? ` \nDetails: ${res.details.join(', ')}` : '';
    //   setError(errorMessage + errorDetails);
    //   return;
    // }

    // reset({
    //   email: '',
    //   password: '',
    // });
    // toast.success('Signed in successfully', { duration: 900, position: 'top-right' });
    // setTimeout(() => {
    //   router.replace('/home');
    // }, 1000);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="login-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* API err message */}
          {error && (
            <div className="text-destructive bg-destructive/10 border-destructive/20 rounded-lg border p-3 text-sm">
              {error}
            </div>
          )}
          <FieldGroup>
            <Controller
              name="email"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email" className="cursor-pointer">
                    Email
                  </FieldLabel>
                  <Input
                    {...field}
                    id="email"
                    aria-invalid={fieldState.invalid}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="password" className="cursor-pointer">
                    Password
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter password"
                      autoComplete="current-password"
                    />
                    <InputGroupAddon
                      align="inline-end"
                      className="cursor-pointer"
                      onClick={() => {
                        setShowPassword((prev) => !prev);
                      }}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className="flex-col text-center">
        <Button
          type="submit"
          form="login-form"
          className={`w-full shadow-lg ${!isValid || isSubmitting ? 'opacity-50' : 'cursor-pointer'}`}
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>
        <div className="mt-4 text-center text-sm">
          <span className="text-muted-foreground">Don&apos;t have an account? </span>
          <Link href="/auth/signup" className="text-primary font-medium hover:underline">
            Sign up
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

export default LoginForm;