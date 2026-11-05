import type { Transition, Variants } from 'motion/react';

export const MOTION_DURATION = 0.35;

export const MOTION_DURATION_FAST = 0.25;

export const MOTION_STAGGER = 0.05;

export const MOTION_MAX_DELAY = 0.3;

export const MOTION_EASE = 'easeOut' as const;

export const MOTION_TRANSITION: Transition = {
  duration: MOTION_DURATION,
  ease: MOTION_EASE,
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: MOTION_TRANSITION,
  },
};

export const listVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER,
      delayChildren: 0.05,
    },
  },
};

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION, ease: MOTION_EASE },
  },
};

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: MOTION_DURATION_FAST, ease: MOTION_EASE },
  },
};

/** Trả về delay (giây) theo index, tối đa `MOTION_MAX_DELAY`. */
export function revealDelay(index = 0): number {
  return Math.min(Math.max(index, 0) * MOTION_STAGGER, MOTION_MAX_DELAY);
}
