import { useEffect, useRef } from "react";

import {
  getRememberedScrollPosition,
  rememberScrollPosition,
} from "@/catalogue/catalogue-session";

export const useScrollRestoration = (key: string, isReady: boolean): void => {
  const restoredKey = useRef<string | null>(null);

  useEffect(() => {
    let scrollRoot: HTMLElement | null = null;
    let setupFrame = 0;

    const setup = () => {
      scrollRoot = document.querySelector<HTMLElement>(".hn-page");
      if (!scrollRoot) return;
      const remember = () => rememberScrollPosition(key, scrollRoot?.scrollTop ?? 0);
      scrollRoot.addEventListener("scroll", remember, { passive: true });
      cleanupRemember = () => {
        remember();
        scrollRoot?.removeEventListener("scroll", remember);
      };
    };
    let cleanupRemember = () => undefined;
    setupFrame = window.requestAnimationFrame(setup);

    return () => {
      window.cancelAnimationFrame(setupFrame);
      cleanupRemember();
    };
  }, [key]);

  useEffect(() => {
    if (!isReady || restoredKey.current === key) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const scrollRoot = document.querySelector<HTMLElement>(".hn-page");
      if (!scrollRoot) return;
      scrollRoot.scrollTop = getRememberedScrollPosition(key);
      restoredKey.current = key;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isReady, key]);
};
