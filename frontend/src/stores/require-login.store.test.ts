import { beforeEach, describe, expect, it } from 'vitest';
import { useRequireLoginStore } from './require-login.store';

describe('require-login.store', () => {
  beforeEach(() => {
    useRequireLoginStore.getState().closeDialog();
  });

  it('mặc định đóng', () => {
    expect(useRequireLoginStore.getState().isOpen).toBe(false);
  });

  it('openDialog mở hộp thoại', () => {
    useRequireLoginStore.getState().openDialog();
    expect(useRequireLoginStore.getState().isOpen).toBe(true);
  });

  it('closeDialog đóng hộp thoại', () => {
    useRequireLoginStore.getState().openDialog();
    useRequireLoginStore.getState().closeDialog();

    expect(useRequireLoginStore.getState().isOpen).toBe(false);
  });
});
