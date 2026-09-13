import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { gsap } from 'gsap';
import type { ScanBeamProps } from './ScanBeam';

const styles = StyleSheet.create({
  beam: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 8,
    height: 2,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    opacity: 0.9,
    zIndex: 2,
  },
});

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

/** Web-only GSAP adapter for the decorative scan beam. */
export function ScanBeam({ active, paused = false }: ScanBeamProps): React.ReactElement | null {
  const beamRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const element = beamRef.current;
    if (element === null || !active || paused || reducedMotion) {
      return undefined;
    }

    const tween = gsap.fromTo(
      element,
      { y: 0, opacity: 0.25 },
      {
        y: 178,
        opacity: 1,
        duration: 2.6,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      },
    );

    return () => {
      tween.kill();
      gsap.set(element, { clearProps: 'transform,opacity' });
    };
  }, [active, paused, reducedMotion]);

  if (!active || paused || reducedMotion) {
    return null;
  }

  return <View ref={beamRef} pointerEvents="none" style={styles.beam} />;
}
