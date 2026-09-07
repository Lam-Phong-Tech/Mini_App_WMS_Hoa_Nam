import { TouchEventHandler, useRef, useState } from "react";

const PULL_THRESHOLD_PX = 72;

const getPageScrollTop = (element: HTMLElement): number =>
  element.closest<HTMLElement>(".hn-page")?.scrollTop ?? 0;

export const shouldRefreshFromPull = (startY: number, endY: number, atTop: boolean): boolean =>
  atTop && endY - startY >= PULL_THRESHOLD_PX;

export const usePullToRefresh = (
  onRefresh: () => Promise<void>,
): {
  pulling: boolean;
  onTouchStart: TouchEventHandler<HTMLElement>;
  onTouchEnd: TouchEventHandler<HTMLElement>;
} => {
  const startY = useRef<number | null>(null);
  const [pulling, setPulling] = useState(false);

  const onTouchStart: TouchEventHandler<HTMLElement> = (event) => {
    if (getPageScrollTop(event.currentTarget) === 0) startY.current = event.touches[0]?.clientY ?? null;
  };

  const onTouchEnd: TouchEventHandler<HTMLElement> = (event) => {
    const startedAt = startY.current;
    startY.current = null;
    const endedAt = event.changedTouches[0]?.clientY;
    if (startedAt === null || endedAt === undefined || !shouldRefreshFromPull(startedAt, endedAt, getPageScrollTop(event.currentTarget) === 0)) {
      return;
    }

    setPulling(true);
    void onRefresh().then(
      () => setPulling(false),
      () => setPulling(false),
    );
  };

  return { pulling, onTouchStart, onTouchEnd };
};
