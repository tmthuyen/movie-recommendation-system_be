import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { User } from '@/shared/types/api.types';
import { useAuthStore } from '@/stores/auth.store';
import RequireRole from './RequireRole';
import RequireAuth from './require-auth';

const role = (code: string) => ({
  id: `r-${code}`,
  name: code,
  code,
  createdAt: new Date('2024-01-01'),
  createdBy: 'system',
  updatedAt: new Date('2024-01-01'),
  updatedBy: 'system',
});

const userWithRoles = (...codes: string[]): User => ({
  id: 'u1',
  email: 'an@example.com',
  fullName: 'Nguyễn An',
  status: 'ACTIVE',
  isVerified: true,
  roles: codes.map(role),
  createdAt: new Date('2024-01-01'),
  createdBy: 'system',
  updatedAt: new Date('2024-01-01'),
  updatedBy: 'system',
});

const setAuth = (state: { user: User | null; isLoading: boolean }) =>
  useAuthStore.setState({ ...state, isAuthenticated: Boolean(state.user) });

describe('RequireRole', () => {
  beforeEach(() => {
    setAuth({ user: null, isLoading: false });
  });

  it('không yêu cầu role → render children ngay cả khi đang loading', () => {
    setAuth({ user: null, isLoading: true });

    render(
      <RequireRole requiredRoles={[]}>
        <p>Nội dung công khai</p>
      </RequireRole>,
    );

    expect(screen.getByText('Nội dung công khai')).toBeInTheDocument();
  });

  it('đang khôi phục phiên → hiển thị spinner', () => {
    setAuth({ user: null, isLoading: true });

    render(
      <RequireRole requiredRoles={['ADMIN']}>
        <p>Nội dung admin</p>
      </RequireRole>,
    );

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
    expect(screen.queryByText('Nội dung admin')).not.toBeInTheDocument();
  });

  it('guest → hiển thị màn hình chuyển hướng, không lộ nội dung', async () => {
    render(
      <RequireRole requiredRoles={['ADMIN']}>
        <p>Nội dung admin</p>
      </RequireRole>,
    );

    expect(await screen.findByText('Đang chuyển hướng...')).toBeInTheDocument();
    expect(screen.queryByText('Nội dung admin')).not.toBeInTheDocument();
  });

  it('sai role → hiển thị trang 403', async () => {
    setAuth({ user: userWithRoles('USER'), isLoading: false });

    render(
      <RequireRole requiredRoles={['ADMIN']}>
        <p>Nội dung admin</p>
      </RequireRole>,
    );

    expect(
      await screen.findByText('Bạn không có quyền truy cập vào trang này.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nội dung admin')).not.toBeInTheDocument();
  });

  it('đúng role → render children', async () => {
    setAuth({ user: userWithRoles('ADMIN'), isLoading: false });

    render(
      <RequireRole requiredRoles={['ADMIN']}>
        <p>Nội dung admin</p>
      </RequireRole>,
    );

    expect(await screen.findByText('Nội dung admin')).toBeInTheDocument();
  });

  it('so khớp role không phân biệt hoa/thường (code "admin" vẫn hợp lệ)', async () => {
    setAuth({ user: userWithRoles('admin'), isLoading: false });

    render(
      <RequireRole requiredRoles={['ADMIN']}>
        <p>Nội dung admin</p>
      </RequireRole>,
    );

    expect(await screen.findByText('Nội dung admin')).toBeInTheDocument();
  });

  it('chấp nhận một trong nhiều role yêu cầu', async () => {
    setAuth({ user: userWithRoles('MODERATOR'), isLoading: false });

    render(
      <RequireRole requiredRoles={['ADMIN', 'MODERATOR']}>
        <p>Nội dung moderator</p>
      </RequireRole>,
    );

    expect(await screen.findByText('Nội dung moderator')).toBeInTheDocument();
  });
});

describe('RequireAuth', () => {
  beforeEach(() => {
    setAuth({ user: null, isLoading: false });
  });

  it('đang khôi phục phiên → spinner', () => {
    setAuth({ user: null, isLoading: true });

    render(
      <RequireAuth>
        <p>Trang cá nhân</p>
      </RequireAuth>,
    );

    expect(screen.getByText('Đang tải...')).toBeInTheDocument();
  });

  it('guest → màn hình chuyển hướng', async () => {
    render(
      <RequireAuth>
        <p>Trang cá nhân</p>
      </RequireAuth>,
    );

    expect(await screen.findByText('Đang chuyển hướng...')).toBeInTheDocument();
    expect(screen.queryByText('Trang cá nhân')).not.toBeInTheDocument();
  });

  it('đã đăng nhập → render children', async () => {
    setAuth({ user: userWithRoles('USER'), isLoading: false });

    render(
      <RequireAuth>
        <p>Trang cá nhân</p>
      </RequireAuth>,
    );

    expect(await screen.findByText('Trang cá nhân')).toBeInTheDocument();
  });
});
