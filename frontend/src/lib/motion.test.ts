import { describe, expect, it } from 'vitest';
import {
  MOTION_DURATION,
  MOTION_MAX_DELAY,
  MOTION_STAGGER,
  cardVariants,
  fadeUpVariants,
  fadeVariants,
  listVariants,
  revealDelay,
} from './motion';

describe('motion tokens', () => {
  it('duration/stagger nằm trong khoảng rules cho phép', () => {
    expect(MOTION_DURATION).toBeGreaterThanOrEqual(0.25);
    expect(MOTION_DURATION).toBeLessThanOrEqual(0.4);
    expect(MOTION_STAGGER).toBeGreaterThanOrEqual(0.04);
    expect(MOTION_STAGGER).toBeLessThanOrEqual(0.08);
  });

  it('revealDelay tăng theo index và giới hạn ở MOTION_MAX_DELAY', () => {
    expect(revealDelay(0)).toBe(0);
    expect(revealDelay(-5)).toBe(0);
    expect(revealDelay(2)).toBeCloseTo(0.1);
    expect(revealDelay(100)).toBe(MOTION_MAX_DELAY);
  });

  it('cardVariants chỉ animate opacity/transform (không layout property)', () => {
    const hidden = cardVariants.hidden as Record<string, unknown>;
    const visible = cardVariants.visible as Record<string, unknown>;

    expect(Object.keys(hidden).sort()).toEqual(['opacity', 'scale', 'y']);
    expect(Object.keys(visible)).toEqual(
      expect.arrayContaining(['opacity', 'scale', 'y', 'transition']),
    );
    for (const key of ['width', 'height', 'margin', 'padding', 'top', 'left']) {
      expect(hidden).not.toHaveProperty(key);
      expect(visible).not.toHaveProperty(key);
    }
  });

  it('listVariants dùng staggerChildren = MOTION_STAGGER', () => {
    const visible = listVariants.visible as {
      transition?: { staggerChildren?: number };
    };

    expect(visible.transition?.staggerChildren).toBe(MOTION_STAGGER);
  });

  it('fadeUp/fade chỉ dùng opacity + translate nhẹ', () => {
    expect(fadeUpVariants.hidden).toMatchObject({ opacity: 0, y: 12 });
    expect(fadeVariants.hidden).toEqual({ opacity: 0 });
  });
});
