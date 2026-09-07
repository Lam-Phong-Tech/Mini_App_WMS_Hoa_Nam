import { useEffect } from "react";

import {
  getRememberedScrollPosition,
  rememberScrollPosition,
} from "@/catalogue/catalogue-session";

export const useScrollRestoration = (key: string, isReady: boolean): void => {
  useEffect(() => {
    const restore = window.requestAnimationFrame(() => {
      if (isReady) window.scrollTo({ top: getRememberedScrollPosition(key), behavior: "auto" });
    });
    const remember = () => rememberScrollPosition(key, window.scrollY);
    window.addEventListener("scroll", remember, { passive: true });

    return () => {
      window.cancelAnimationFrame(restore);
      remember();
      window.removeEventListener("scroll", remember);
    };
  }, [isReady, key]);
};
