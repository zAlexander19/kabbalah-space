import type { Variants, Transition } from 'framer-motion';
import { motion as M } from '../tokens';

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: M.flowing },
  exit:    { opacity: 0, y: -8, transition: M.swift },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: M.flowing },
  exit:    { opacity: 0, transition: M.swift },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: M.flowing },
  exit:    { opacity: 0, scale: 0.96, transition: M.swift },
};

export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: M.stagger } },
};

export const eventChip: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: M.unveil },
  exit:    { opacity: 0, scale: 0.97, transition: M.swift },
};

export const panelSpring: Transition = { duration: 0.32, ease: [0.16, 1, 0.3, 1] };

export const panelExit: Transition = { duration: 0.22, ease: [0.4, 0, 0.6, 1] };
