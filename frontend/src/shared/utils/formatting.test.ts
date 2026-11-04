import { describe, expect, it } from 'vitest';
import dateTimeUtils, { formatDateTime, formatShortDate } from './formatting';

describe('formatDateTime', () => {
  it('định dạng Date theo DD-MM-YYYY HH:mm:ss', () => {
    expect(formatDateTime(new Date(2024, 0, 5, 3, 7, 9))).toBe('05-01-2024 03:07:09');
  });

  it('định dạng chuỗi ISO (giờ local, không có Z)', () => {
    expect(formatDateTime('2024-12-31T23:05:01')).toBe('31-12-2024 23:05:01');
  });

  it('định dạng timestamp number', () => {
    const timestamp = new Date(2024, 5, 15, 18, 30, 0).getTime();
    expect(formatDateTime(timestamp)).toBe('15-06-2024 18:30:00');
  });

  it('pad số 0 cho ngày/giờ/tháng nhỏ hơn 10', () => {
    expect(formatDateTime(new Date(2025, 8, 9, 8, 5, 4))).toBe('09-09-2025 08:05:04');
  });
});

describe('formatShortDate', () => {
  it('chỉ trả về ngày theo DD-MM-YYYY', () => {
    expect(formatShortDate(new Date(2024, 0, 5, 23, 59, 59))).toBe('05-01-2024');
  });

  it('định dạng chuỗi ngày tháng', () => {
    expect(formatShortDate('2023-11-02T10:00:00')).toBe('02-11-2023');
  });
});

describe('default export', () => {
  it('gom đủ 2 hàm tiện ích', () => {
    expect(dateTimeUtils.formatDateTime).toBe(formatDateTime);
    expect(dateTimeUtils.formatShortDate).toBe(formatShortDate);
  });
});
