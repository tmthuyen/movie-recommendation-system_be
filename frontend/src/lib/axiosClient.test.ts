import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Test `axiosClient` bằng cách mock `axios.create` để bắt lại interceptor.
 * Nhờ vậy ta test đúng logic thật của module (gắn token, camel hoá, refresh
 * single-flight) mà không cần gọi mạng.
 */
const mocks = vi.hoisted(() => {
  const requestHandlers: Record<string, any> = {};
  const responseHandlers: Record<string, any> = {};

  const instance: any = vi.fn();

  instance.interceptors = {
    request: {
      use: (onFulfilled: any, onRejected: any) => {
        requestHandlers.onFulfilled = onFulfilled;
        requestHandlers.onRejected = onRejected;
      },
    },
    response: {
      use: (onFulfilled: any, onRejected: any) => {
        responseHandlers.onFulfilled = onFulfilled;
        responseHandlers.onRejected = onRejected;
      },
    },
  };

  instance.post = vi.fn();
  instance.get = vi.fn();
  instance.delete = vi.fn();

  const isAxiosError = (error: any) => Boolean(error?.isAxiosError);

  return { instance, requestHandlers, responseHandlers, isAxiosError };
});

vi.mock('axios', () => ({
  default: {
    create: () => mocks.instance,
    isAxiosError: mocks.isAxiosError,
  },
  isAxiosError: mocks.isAxiosError,
}));

import axiosClient, { parseAxiosError } from '@/lib/axiosClient';

/** Lỗi 401 gắn với đúng object config để test có thể assert sau khi retry. */
const unauthorized = (config: Record<string, any>) => ({
  isAxiosError: true,
  config,
  response: { status: 401, data: { success: false, statusCode: 401, message: 'Unauthorized' } },
});

describe('request interceptor', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null });
  });

  it('gắn Bearer token từ auth store', () => {
    useAuthStore.setState({ accessToken: 'token-abc' });

    const config = mocks.requestHandlers.onFulfilled({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer token-abc');
  });

  it('không gắn Authorization khi chưa đăng nhập', () => {
    const config = mocks.requestHandlers.onFulfilled({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });

  it('chuyển tiếp lỗi request', async () => {
    const error = new Error('network');
    await expect(mocks.requestHandlers.onRejected(error)).rejects.toBe(error);
  });
});

describe('response interceptor', () => {
  it('camel hoá toàn bộ payload trả về', () => {
    const response = mocks.responseHandlers.onFulfilled({
      data: {
        success: true,
        result: { full_name: 'Nguyễn A', movie_id: 1, nested_data: { avatar_url: '/a.png' } },
      },
    });

    expect(response.data).toEqual({
      success: true,
      result: { fullName: 'Nguyễn A', movieId: 1, nestedData: { avatarUrl: '/a.png' } },
    });
  });

  it('không đụng vào response không có body', () => {
    const response = { data: null, status: 204 };
    expect(mocks.responseHandlers.onFulfilled(response)).toBe(response);
  });
});

describe('parseAxiosError', () => {
  it('lỗi ≥ 500 được chuẩn hoá thành thông báo chung tiếng Việt', () => {
    const error = {
      isAxiosError: true,
      response: { status: 502, data: { statusCode: 502, message: 'Bad gateway' } },
    };

    expect(parseAxiosError(error)).toEqual({
      statusCode: 502,
      message: 'Lỗi máy chủ, vui lòng thử lại sau.',
    });
  });

  it('lỗi 4xx giữ message từ backend', () => {
    const error = {
      isAxiosError: true,
      response: { status: 400, data: { statusCode: 400, message: 'Thể loại không tồn tại' } },
    };

    expect(parseAxiosError(error)).toEqual({
      statusCode: 400,
      message: 'Thể loại không tồn tại',
    });
  });

  it('customMessage ghi đè message của server', () => {
    const error = {
      isAxiosError: true,
      response: { status: 409, data: { message: 'Email đã tồn tại' } },
    };

    expect(parseAxiosError(error, 'Không thể đăng ký').message).toBe('Không thể đăng ký');
  });

  it('lỗi 4xx không có message → thông báo mặc định', () => {
    const error = { isAxiosError: true, response: { status: 422, data: {} } };

    expect(parseAxiosError(error)).toEqual({ statusCode: 422, message: 'Có lỗi xảy ra' });
  });

  it('lỗi không phải axios (hoặc mất response) → 500 + thông báo chung', () => {
    expect(parseAxiosError(new Error('boom'))).toEqual({
      statusCode: 500,
      message: 'Có lỗi xảy ra',
    });
    expect(parseAxiosError({ isAxiosError: true })).toEqual({
      statusCode: 500,
      message: 'Lỗi máy chủ, vui lòng thử lại sau.',
    });
  });
});

describe('401 single-flight refresh', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'old-token' });
    mocks.instance.mockResolvedValue({ data: { ok: true }, status: 200 });
  });

  it('refresh thành công → cập nhật token và retry request gốc', async () => {
    mocks.instance.post.mockResolvedValue({
      data: { success: true, result: { accessToken: 'new-token' } },
    });

    const originalRequest: any = { url: '/movies', headers: {}, _retry: false };
    const result = await mocks.responseHandlers.onRejected({
      isAxiosError: true,
      config: originalRequest,
      response: { status: 401, data: { message: 'Unauthorized' } },
    });

    expect(mocks.instance.post).toHaveBeenCalledWith('/auth/refresh', null, {
      withCredentials: true,
    });
    expect(useAuthStore.getState().accessToken).toBe('new-token');
    expect(originalRequest._retry).toBe(true);
    expect(originalRequest.headers.Authorization).toBe('Bearer new-token');
    expect(mocks.instance).toHaveBeenCalledWith(originalRequest);
    expect(result).toEqual({ data: { ok: true }, status: 200 });
  });

  it('chỉ gọi refresh 1 lần khi nhiều request cùng 401 (single-flight)', async () => {
    let resolveRefresh: (value: any) => void = () => {};
    mocks.instance.post.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const first: any = { url: '/a', headers: {}, _retry: false };
    const second: any = { url: '/b', headers: {}, _retry: false };

    const firstPromise = mocks.responseHandlers.onRejected(unauthorized(first));
    const secondPromise = mocks.responseHandlers.onRejected(unauthorized(second));

    resolveRefresh({ data: { result: { accessToken: 'shared-token' } } });

    await Promise.all([firstPromise, secondPromise]);

    expect(mocks.instance.post).toHaveBeenCalledTimes(1);
    expect(first.headers.Authorization).toBe('Bearer shared-token');
    expect(second.headers.Authorization).toBe('Bearer shared-token');
    expect(mocks.instance).toHaveBeenCalledTimes(2);
  });

  it('refresh thất bại → xoá token và reject', async () => {
    const refreshError = new Error('refresh failed');
    mocks.instance.post.mockRejectedValue(refreshError);

    const original: any = { url: '/movies', headers: {}, _retry: false };

    await expect(
      mocks.responseHandlers.onRejected({
        isAxiosError: true,
        config: original,
        response: { status: 401, data: {} },
      }),
    ).rejects.toBe(refreshError);

    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('lỗi từ chính endpoint /auth/refresh → xoá token, không retry', async () => {
    const refreshError = {
      isAxiosError: true,
      config: { url: '/auth/refresh' },
      response: { status: 401, data: {} },
    };

    await expect(mocks.responseHandlers.onRejected(refreshError)).rejects.toBe(refreshError);

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(mocks.instance.post).not.toHaveBeenCalled();
  });

  it('request đã retry 1 lần thì không refresh lần nữa', async () => {
    const original: any = { url: '/movies', headers: {}, _retry: true };
    const error = {
      isAxiosError: true,
      config: original,
      response: { status: 401, data: {} },
    };

    await expect(mocks.responseHandlers.onRejected(error)).rejects.toBe(error);

    expect(mocks.instance.post).not.toHaveBeenCalled();
  });

  it('lỗi không phải 401 được chuyển tiếp nguyên vẹn', async () => {
    const error = {
      isAxiosError: true,
      config: { url: '/movies', headers: {} },
      response: { status: 403, data: { message: 'Forbidden' } },
    };

    await expect(mocks.responseHandlers.onRejected(error)).rejects.toBe(error);
    expect(mocks.instance.post).not.toHaveBeenCalled();
  });
});

describe('cấu hình instance', () => {
  it('default export chính là axios instance đã cấu hình', () => {
    expect(axiosClient).toBe(mocks.instance);
  });
});
