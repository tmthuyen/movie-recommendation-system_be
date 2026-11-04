import { describe, expect, it } from 'vitest';
import { mapUserStatus } from './mapStatus';

describe('mapUserStatus', () => {
  it('map trạng thái ACTIVE sang nhãn tiếng Việt + màu xanh', () => {
    const result = mapUserStatus('ACTIVE');

    expect(result.label).toBe('Hoạt động');
    expect(result.color).toContain('text-green-500');
  });

  it('map LOCKED sang nhãn "Đã khóa" + màu đỏ', () => {
    const result = mapUserStatus('LOCKED');

    expect(result.label).toBe('Đã khóa');
    expect(result.color).toContain('text-red-500');
  });

  it('không phân biệt chữ hoa/thường ở input', () => {
    expect(mapUserStatus('unverified').label).toBe('Chưa xác thực');
    expect(mapUserStatus('Pending').label).toBe('Đang chờ');
  });

  it('trạng thái lạ → giữ nguyên label (chữ hoa) + màu xám mặc định', () => {
    const result = mapUserStatus('deleted');

    expect(result.label).toBe('DELETED');
    expect(result.color).toBe('text-gray-500 border border-gray-500');
  });
});
