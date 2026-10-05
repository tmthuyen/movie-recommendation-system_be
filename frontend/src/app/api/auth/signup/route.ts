import { NextRequest, NextResponse } from 'next/server';
import { createRequestContainer } from '@/infrastructure/di/container';
import withErrorHandling from '@/infrastructure/api/next/withErrorHandling';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const di = createRequestContainer();

  const body = await req.json();
  const { email, password, password_confirm, full_name } = body;

  await di.auth.signUpWithEmailPasswordUC.execute({
    email,
    password,
    password_confirm: password_confirm,
    full_name: full_name || 'New User',
  });

  return NextResponse.json({ success: true, message: 'Signup successful' }, { status: 201 });
});
