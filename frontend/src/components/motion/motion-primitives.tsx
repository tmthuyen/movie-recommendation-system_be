'use client';

import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from 'motion/react';
import type { ReactNode } from 'react';
import {
  MOTION_DURATION,
  MOTION_EASE,
  cardVariants,
  listVariants,
  revealDelay,
} from '@/lib/motion';

type MotionDivProps = Omit<
  HTMLMotionProps<'div'>,
  'variants' | 'initial' | 'animate' | 'whileInView' | 'viewport' | 'transition'
>;

interface MotionRevealProps extends MotionDivProps {
  children: ReactNode;
  /** Thứ tự item dùng để tính delay. */
  index?: number;
  /** Chỉ chạy animation lần đầu khi vào viewport. */
  once?: boolean;
  /** `mount`: chạy khi mount; `in-view`: chạy khi vào viewport. */
  when?: 'mount' | 'in-view';
}

/** Fade-up cho một item/card; delay theo `index`, tôn trọng reduced motion. */
export function MotionReveal({
  children,
  index = 0,
  once = true,
  when = 'in-view',
  ...rest
}: MotionRevealProps) {
  const reduceMotion = useReducedMotion();
  const animateOnMount = !reduceMotion && when === 'mount';
  const animateInView = !reduceMotion && when === 'in-view';

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={animateOnMount ? { opacity: 1, y: 0 } : undefined}
      whileInView={animateInView ? { opacity: 1, y: 0 } : undefined}
      viewport={animateInView ? { once, amount: 0.2 } : undefined}
      transition={{
        duration: MOTION_DURATION,
        ease: MOTION_EASE,
        delay: reduceMotion ? 0 : revealDelay(index),
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface MotionStaggerProps extends MotionDivProps {
  children: ReactNode;
  /** `mount`: stagger khi mount; `in-view`: stagger khi cả khối vào viewport. */
  when?: 'mount' | 'in-view';
}

/** Parent stagger cho grid/list; con là `MotionItem` hoặc component có `variants`. */
export function MotionStagger({
  children,
  when = 'mount',
  ...rest
}: MotionStaggerProps) {
  const reduceMotion = useReducedMotion();
  const animateInView = !reduceMotion && when === 'in-view';

  return (
    <motion.div
      variants={reduceMotion ? undefined : listVariants}
      initial={reduceMotion ? false : 'hidden'}
      animate={!reduceMotion && when === 'mount' ? 'visible' : undefined}
      whileInView={animateInView ? 'visible' : undefined}
      viewport={animateInView ? { once: true, amount: 0.15 } : undefined}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

type MotionItemProps = MotionDivProps & { children: ReactNode };

/** Item con cho `MotionStagger`; kế thừa variant từ parent. */
export function MotionItem({ children, ...rest }: MotionItemProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div variants={reduceMotion ? undefined : cardVariants} {...rest}>
      {children}
    </motion.div>
  );
}
