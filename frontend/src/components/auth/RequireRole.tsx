import { roleUtil } from '@/shared/utils/roleUtil';
import { useAuthStore } from '@/stores/auth.store';
import React from 'react';

interface RequireRoleProps {
  requiredRoles: string[];
  children: React.ReactNode;
}

export default function RequireRole({ requiredRoles, children }: RequireRoleProps) {
  // public
  if (!requiredRoles || requiredRoles.length === 0) {
    return children;
  }

  // user
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return null;
  }

  const userRoleCodes = roleUtil.mapRoleToCodes(user.roles);

  const hasRequiredRole = requiredRoles.some((requiredRole) =>
    userRoleCodes.includes(requiredRole)
  );

  // forbidden
  if (!hasRequiredRole) {
    return (
      <div className="m-auto text-center text-lg text-red-500">
        Bạn không có quyền truy cập vào trang này.
      </div>
    );
  }

  return children;
}
