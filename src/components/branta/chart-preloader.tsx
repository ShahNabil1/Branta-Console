import type { CSSProperties } from "react";
import "./chart-preloader.css";

/** One full cycle of the chart animation, in ms (matches --load-speed). */
export const PRELOADER_CYCLE_MS = 5000;

export type PreloaderVariant = "dissolve" | "horizon" | "node";
export const PRELOADER_VARIANTS: { id: PreloaderVariant; label: string }[] = [
  { id: "dissolve", label: "1 · Dashboard Dissolve" },
  { id: "horizon", label: "2 · Data Horizon" },
  { id: "node", label: "3 · Node Convergence" },
];

const BAR_X = ["13.6%", "31.8%", "50%", "68.2%", "86.4%"];
const BAR_TOP = ["58%", "35%", "43%", "40%", "30%"];
const BAR_C = ["#06B6D4", "#10B981", "#E56A17", "#F59E0B", "#6366F1"];

export function ChartPreloader({
  leaving = false,
  variant = "dissolve",
  scrubAt,
  speedMs,
}: {
  leaving?: boolean;
  /** Freeze the animation at this many ms into the cycle (preview only). */
  scrubAt?: number;
  variant?: PreloaderVariant;
  /** Override the cycle length (preview only). */
  speedMs?: number;
}) {
  const style: CSSProperties & Record<string, string | number> = { opacity: leaving ? 0 : 1 };
  if (speedMs) style["--load-speed"] = `${speedMs}ms`;
  if (scrubAt !== undefined) style["--t"] = `${scrubAt}ms`;
  return (
    <div
      className="preloader-screen transition-opacity duration-300"
      style={style}
      data-scrub={scrubAt !== undefined ? "" : undefined}
      role="status"
      aria-label="Loading"
    >
      <div className="preloader-card" data-variant={variant}>
        <div className="lines">
          {[0, 1, 2, 3].map((i) => <div key={i} className="connector" />)}
        </div>
        <div className="origin" />
        <div className="points">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="point" />)}
        </div>
        <div className="bars">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="bar" />)}
        </div>
        {variant === "dissolve" && (
          <>
            <div className="dv-grid">
              {[0, 1, 2, 3].map((i) => <div key={i} className="dv-tile" />)}
            </div>
            <div className="dv-status"><span className="dv-dot" />System synchronized</div>
          </>
        )}
        {variant === "horizon" && (
          <>
            <div className="hz-beam" />
            <div className="hz-line" />
          </>
        )}
        {variant === "node" && (
          <>
            {BAR_X.map((x, i) => (
              <div key={i} className="nd-dot" style={{ "--x": x, "--y": BAR_TOP[i], "--c": BAR_C[i] } as CSSProperties} />
            ))}
            <div className="nd-ring" />
            <div className="nd-core" />
          </>
        )}
      </div>
    </div>
  );
}
