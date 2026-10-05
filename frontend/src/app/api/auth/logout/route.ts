import { cookies } from 'next/headers';

const deleteCookie = async (name: string = 'access_token') => {
  const cookieStore = await cookies();
  console.log('Cookie', cookieStore);

  // Method 1: Delete explicitly
  cookieStore.delete(name);
};
export async function POST() {
  await deleteCookie();
  return Response.json({ success: true, message: 'Logout successful' }, { status: 200 });
}
