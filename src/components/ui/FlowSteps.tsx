import type { CSSProperties } from "react";

type WmsFlowStepsProps = {
  current: number;
  labels: readonly string[];
  className?: string;
};

/** Compact, reusable progress marker for multi-step WMS flows. */
export function WmsFlowSteps({
  current,
  labels,
  className = "",
}: WmsFlowStepsProps) {
  return (
    <ol
      aria-label="Tiến trình nghiệp vụ"
      className={`wms-flow-steps ${className}`}
      style={{ "--wms-flow-count": labels.length } as CSSProperties}
    >
      {labels.map((label, index) => {
        const step = index + 1;
        const state =
          step < current ? "done" : step === current ? "current" : "todo";

        return (
          <li className={`wms-flow-step wms-flow-step--${state}`} key={label}>
            <span aria-hidden="true" className="wms-flow-step__marker">
              {step < current ? "✓" : step}
            </span>
            <span className="wms-flow-step__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
