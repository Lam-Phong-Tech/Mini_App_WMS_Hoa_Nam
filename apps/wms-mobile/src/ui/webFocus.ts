/** Narrow browser focus port; native builds do not depend on lib.dom types. */
export interface WebFocusTarget {
  focus?: () => void;
  isConnected?: boolean;
  querySelector?: (selector: string) => WebFocusTarget | null;
  querySelectorAll?: (selector: string) => ArrayLike<WebFocusTarget>;
}
export interface WebFocusDocument {
  readonly activeElement?: WebFocusTarget | null;
}
export interface WebFocusKey {
  readonly key?: string;
  readonly shiftKey?: boolean;
  preventDefault?: () => void;
}
export function webFocusDocument(): WebFocusDocument | undefined {
  return (globalThis as unknown as { document?: WebFocusDocument }).document;
}
