import { RefObject, useEffect, useRef } from "react";

/**
 * A best-effort progressive reveal for newly appended DOM cards. It is loaded
 * only after there is work to animate, never controls the ZaUI scroller, and
 * is intentionally disabled for TanStack-owned virtual rows.
 */
export const useProductReveal = (
  gridRef: RefObject<HTMLElement>,
  renderedCount: number,
  enabled: boolean,
): void => {
  const previousCount = useRef(0);

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = renderedCount;
    if (!enabled || renderedCount <= previous || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const grid = gridRef.current;
    if (!grid) return undefined;
    const nodes = Array.from(grid.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains("product-card"))
      .slice(previous, renderedCount);
    if (!nodes.length) return undefined;

    let disposed = false;
    let revert: (() => void) | undefined;
    void import("gsap").then(({ gsap }) => {
      if (disposed) return;
      const context = gsap.context(() => {
        gsap.fromTo(nodes, { opacity: 0.5, y: 6 }, {
          opacity: 1,
          y: 0,
          duration: 0.18,
          stagger: 0.025,
          ease: "power1.out",
          clearProps: "opacity,transform",
        });
      }, grid);
      revert = () => context.revert();
    }).catch(() => {
      // Optional motion cannot hide content or affect the list's interaction.
    });

    return () => {
      disposed = true;
      revert?.();
    };
  }, [enabled, gridRef, renderedCount]);
};
