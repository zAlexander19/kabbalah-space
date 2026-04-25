import type { Variants } from 'framer-motion';
import { motion as M } from '../tokens';

export const breathScale: Variants = {
  animate: {
    scale: [1, 1.025, 1],
    transition: M.breath,
  },
};

export const breathHalo: Variants = {
  animate: {
    opacity: [0.4, 0.7, 0.4],
    transition: { ...M.breath, delay: 2 },
  },
};

export const breathRing: Variants = {
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: M.breath,
  },
};

export const breathFast: Variants = {
  animate: {
    opacity: [0.6, 1, 0.6],
    transition: { duration: 3, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' },
  },
};

export function randomBreathDelay(): number {
  return Math.random() * 2;
}
