import { useCallback, useEffect, useRef, useState } from "react";

export interface DebouncedValue<T> {
  value: T;
  flush: () => void;
}

/**
 * Delays committed query state without changing the controlled input itself.
 * Callers can pause while an IME composition is active and explicitly flush
 * the pending value on Enter.
 */
export const useDebouncedValue = <T>(
  value: T,
  delayMs: number,
  enabled = true,
): DebouncedValue<T> => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const latestValue = useRef(value);
  const timeoutRef = useRef<number | null>(null);
  latestValue.current = value;

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    clearTimer();
    setDebouncedValue(latestValue.current);
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();
    if (!enabled) return undefined;
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setDebouncedValue(value);
    }, delayMs);
    return clearTimer;
  }, [clearTimer, delayMs, enabled, value]);

  return { value: debouncedValue, flush };
};
