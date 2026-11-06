import type { P19Flow, P19Owner, P19View } from '../p19Types';
export function createLinkedViewBridge(options: {
  owner: P19Owner;
  getCasePresentation(): unknown;
}): { snapshot(): P19View; flow: P19Flow };
