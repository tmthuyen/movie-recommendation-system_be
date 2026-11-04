import { describe, expect, it } from 'vitest';
import { safeJson } from './helpers';

const fakeResponse = (jsonImpl: () => Promise<unknown>) =>
  ({ json: jsonImpl }) as unknown as Response;

describe('safeJson', () => {
  it('parse JSON thành công', async () => {
    const res = fakeResponse(async () => ({ ok: true }));

    await expect(safeJson<{ ok: boolean }>(res)).resolves.toEqual({ ok: true });
  });

  it('trả null khi body không phải JSON hợp lệ', async () => {
    const res = fakeResponse(async () => {
      throw new SyntaxError('Unexpected token');
    });

    await expect(safeJson(res)).resolves.toBeNull();
  });
});
