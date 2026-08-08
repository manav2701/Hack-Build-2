'use client';

import React from 'react';

/**
 * The house entrance animation: 28px up, fading in, on the Raw Form easing curve.
 *
 * Deliberately CSS, not a JS animation library. A JS reveal starts the element at
 * `opacity: 0` and depends on the library to put it back — so anything that stops that
 * animation from running leaves the content *permanently invisible*. That is not
 * hypothetical here: the first build of the auth screens rendered a blank page, because
 * framer-motion's mount animation did not fire for animated components that also
 * consume the auth context, and the page had no way to recover.
 *
 * A CSS keyframe with `both` fill cannot fail that way — if animations are off, the
 * element simply sits at its final state. `prefers-reduced-motion` is honoured globally
 * in globals.css.
 *
 * framer-motion is still the right tool for presence and gesture work (see
 * TranscriptRail's AnimatePresence); it is just the wrong tool for revealing content.
 */

type RiseProps<T extends React.ElementType> = {
  as?: T;
  /** Stagger, in seconds. */
  delay?: number;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'delay' | 'className' | 'children'>;

export function Rise<T extends React.ElementType = 'div'>({
  as,
  delay = 0,
  className = '',
  style,
  children,
  ...rest
}: RiseProps<T>) {
  const Component = (as || 'div') as React.ElementType;
  return (
    <Component
      className={`animate-rise ${className}`}
      style={{ animationDelay: delay ? `${delay}s` : undefined, ...(style as object) }}
      {...rest}
    >
      {children}
    </Component>
  );
}
