import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// useReducedMotion trả true cho toàn bộ file test.
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => true };
});

import { MotionItem, MotionReveal, MotionStagger } from './motion-primitives';

describe('motion primitives — reduced motion', () => {
  it('MotionReveal render children, không set opacity 0 / translate', () => {
    render(
      <MotionReveal when="mount" data-testid="reveal">
        <span>Reduced reveal</span>
      </MotionReveal>,
    );

    const element = screen.getByTestId('reveal');
    expect(screen.getByText('Reduced reveal')).toBeInTheDocument();
    expect(element.style.opacity).not.toBe('0');
    expect(element.style.transform).not.toContain('translate');
  });

  it('MotionStagger render đủ item, không set opacity 0', () => {
    render(
      <MotionStagger when="in-view" className="list" data-testid="stagger">
        <MotionItem>Item A</MotionItem>
        <MotionItem>Item B</MotionItem>
      </MotionStagger>,
    );

    const stagger = screen.getByTestId('stagger');
    expect(stagger.children).toHaveLength(2);
    expect(stagger.style.opacity).not.toBe('0');
    expect(screen.getByText('Item A')).toBeInTheDocument();
    expect(screen.getByText('Item B')).toBeInTheDocument();
  });
});
