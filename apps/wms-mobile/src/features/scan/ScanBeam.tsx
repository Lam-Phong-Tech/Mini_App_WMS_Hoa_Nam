import type React from 'react';

export interface ScanBeamProps {
  /** Beam is rendered only while the scanner is actually active. */
  active: boolean;
  /** Pauses the decoration while a workflow modal owns the screen. */
  paused?: boolean;
}

/**
 * Native/PDA adapter. Android keeps the React Native scanner presentation and
 * deliberately does not import the Web GSAP runtime.
 */
export function ScanBeam(_props: ScanBeamProps): React.ReactElement | null {
  return null;
}
