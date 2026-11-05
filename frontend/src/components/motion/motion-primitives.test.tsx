import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MotionItem, MotionReveal, MotionStagger } from './motion-primitives';

describe('MotionReveal', () => {
  it('render children và forward className/role', () => {
    render(
      <MotionReveal when="mount" className="reveal-item" role="listitem">
        <span>Nội dung reveal</span>
      </MotionReveal>,
    );

    const item = screen.getByRole('listitem');
    expect(item).toHaveClass('reveal-item');
    expect(screen.getByText('Nội dung reveal')).toBeInTheDocument();
  });

  it('forward data-* và index mà không lỗi', () => {
    render(
      <MotionReveal index={4} data-testid="reveal" data-card>
        <span>Card</span>
      </MotionReveal>,
    );

    const item = screen.getByTestId('reveal');
    expect(item).toHaveAttribute('data-card');
    expect(item).toBeInTheDocument();
  });
});

describe('MotionStagger', () => {
  it('render children trong một wrapper có className', () => {
    const { container } = render(
      <MotionStagger when="mount" className="grid gap-3">
        <MotionItem>Item 1</MotionItem>
        <MotionItem>Item 2</MotionItem>
      </MotionStagger>,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveClass('grid', 'gap-3');
    expect(wrapper.children).toHaveLength(2);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });
});

describe('MotionItem', () => {
  it('render children và forward className', () => {
    render(
      <MotionItem className="chip" data-testid="item">
        Chip
      </MotionItem>,
    );

    expect(screen.getByTestId('item')).toHaveClass('chip');
    expect(screen.getByText('Chip')).toBeInTheDocument();
  });
});
