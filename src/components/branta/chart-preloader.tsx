import type { CSSProperties } from "react";
import "./chart-preloader.css";

/** One full cycle of the chart animation, in ms (matches --load-speed). */
export const PRELOADER_CYCLE_MS = 7000;

export function ChartPreloader({
  leaving = false,
  scrubAt,
  speedMs,
}: {
  leaving?: boolean;
  /** Freeze the animation at this many ms into the cycle (preview only). */
  scrubAt?: number;
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
      <div className="preloader-card">
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
        <div className="gem" />
        <div className="gem-dot left" />
        <div className="gem-dot right" />
        <div className="gem-dot top" />
        <div className="gem-dot bottom" />
        <div className="sparks one" />
        <div className="sparks two" />
        <div className="sparks three" />
      </div>
    </div>
  );
}
