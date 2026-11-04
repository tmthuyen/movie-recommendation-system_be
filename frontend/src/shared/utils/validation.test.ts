import { describe, expect, it } from 'vitest';
import { isEmail } from './validation';

describe('isEmail', () => {
  it('chấp nhận email hợp lệ', () => {
    expect(isEmail('an@example.com')).toBe(true);
    expect(isEmail('nguyen.van.a+tag@sub.example.vn')).toBe(true);
  });

  it('từ chối email thiếu @, thiếu domain hoặc có khoảng trắng', () => {
    expect(isEmail('anexample.com')).toBe(false);
    expect(isEmail('an@')).toBe(false);
    expect(isEmail('an@example')).toBe(false);
    expect(isEmail('an @example.com')).toBe(false);
    expect(isEmail('')).toBe(false);
  });
});
