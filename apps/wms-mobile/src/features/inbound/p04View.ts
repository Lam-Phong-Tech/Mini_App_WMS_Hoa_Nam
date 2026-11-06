/** Local UI memory, never part of the API snapshot. */
export interface P04ViewState {
  scroll?: Partial<Record<1 | 2 | 3 | 4, number>>;
  filter?: 'all' | 'valid' | 'duplicate' | 'invalid';
  all?: boolean;
  manual?: boolean;
  rawInput?: string;
  /** Opt-in scanner checkpoint. UI memory only, never sent in a P04 body. */
  manualSelection?: { start: number; end: number };
  manualFocused?: boolean;
  /** Parent scanner applies once after the standalone exception is unmounted. */
  exceptionReturn?: {
    token: string;
    mode: 'previous' | 'manual';
    focus: boolean;
    selection?: { start: number; end: number };
  };
  expandedSkus?: string[];
}
