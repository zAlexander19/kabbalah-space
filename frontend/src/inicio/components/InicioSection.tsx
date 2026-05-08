import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

type Props = {
  children: React.ReactNode;
  /** Override vertical padding for sections that need extra room (the
   *  full-screen hook wants more breathing space than the body sections). */
  className?: string;
};

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Wrapper for every manifiesto section. The shared concerns:
 *  - vertical padding generous enough to give the text air;
 *  - a one-shot fade-up triggered by `useInView` when the section is
 *    mostly within the viewport;
 *  - `prefers-reduced-motion` collapses the animation to a plain fade,
 *    leaving any per-section motion (orbs, line draws) to the children
 *    to disable themselves the same way.
 */
export default function InicioSection({ children, className = '' }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: reduced ? 0 : 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 24 }}
      transition={{ duration: 0.85, ease }}
      className={`py-24 md:py-32 ${className}`}
    >
      {children}
    </motion.section>
  );
}
