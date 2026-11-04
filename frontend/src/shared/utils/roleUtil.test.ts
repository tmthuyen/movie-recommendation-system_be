import { describe, expect, it } from 'vitest';
import { Role } from '@/shared/types/api.types';
import { roleUtil } from './roleUtil';

const role = (code: string): Role => ({
  id: `role-${code}`,
  name: code,
  code,
  createdAt: new Date('2024-01-01'),
  createdBy: 'system',
  updatedAt: new Date('2024-01-01'),
  updatedBy: 'system',
});

describe('roleUtil.mapRoleToCodes', () => {
  it('chuyển role code sang chữ hoa', () => {
    expect(roleUtil.mapRoleToCodes([role('admin'), role('user')])).toEqual(['ADMIN', 'USER']);
  });

  it('giữ nguyên code đã là chữ hoa', () => {
    expect(roleUtil.mapRoleToCodes([role('ADMIN'), role('MODERATOR')])).toEqual([
      'ADMIN',
      'MODERATOR',
    ]);
  });

  it('trả về mảng rỗng khi user không có role', () => {
    expect(roleUtil.mapRoleToCodes([])).toEqual([]);
  });
});

describe('roleUtil.getHomeRouteByRole', () => {
  it('ADMIN vào /dashboard (kể cả khi có thêm role khác)', () => {
    expect(roleUtil.getHomeRouteByRole([role('USER'), role('ADMIN')])).toBe('/dashboard');
    expect(roleUtil.getHomeRouteByRole([role('admin')])).toBe('/dashboard');
  });

  it('USER vào trang chủ', () => {
    expect(roleUtil.getHomeRouteByRole([role('USER')])).toBe('/');
  });

  it('role lạ hoặc không có role đều về trang chủ', () => {
    expect(roleUtil.getHomeRouteByRole([role('MODERATOR')])).toBe('/');
    expect(roleUtil.getHomeRouteByRole([])).toBe('/');
  });
});
