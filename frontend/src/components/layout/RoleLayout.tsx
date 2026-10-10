import AdminLayout from '@/components/layout/AdminLayout';
import UserLayout from '@/components/layout/UserLayout';
import { roleUtil } from '@/shared/utils/roleUtil';
import { useAuthStore } from '@/stores/auth.store';

export default function RoleLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return <div>Loading...</div>;
  }

  const userRoleCodes = roleUtil.mapRoleToCodes(user.roles);

  if (userRoleCodes.includes('ADMIN')) {
    return <AdminLayout>{children}</AdminLayout>;
  }

  return <UserLayout>{children}</UserLayout>;
}
