import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import "./AnimatedBorderButton.css";

type AnimatedBorderButtonProps = ComponentPropsWithoutRef<"button"> & {
  accent?: string;
  surface?: string;
  track?: string;
  labelColor?: string;
  radius?: number;
  strokeWidth?: number;
  duration?: number;
  animate?: boolean;
};

export function AnimatedBorderButton({
  children,
  className,
  style,
  type = "button",
  accent = "#ff4f70",
  surface = "#2b0505",
  track = "#580d1b",
  labelColor = "#f17b8e",
  radius = 9,
  strokeWidth = 2.5,
  duration = 3,
  animate = true,
  ...buttonProps
}: AnimatedBorderButtonProps) {
  const border = Math.max(0.5, strokeWidth);
  const inset = border / 2;

  const variables = {
    "--abb-accent": accent,
    "--abb-surface": surface,
    "--abb-track": track,
    "--abb-label": labelColor,
    "--abb-radius": `${radius}px`,
    "--abb-path-radius": `${Math.max(0, radius - inset)}px`,
    "--abb-inset": `${inset}px`,
    "--abb-stroke": `${border}px`,
    "--abb-duration": `${Math.max(0.1, duration)}s`,
    ...style,
  } as CSSProperties;

  return (
    <button
      {...buttonProps}
      type={type}
      className={["animated-border-button", className].filter(Boolean).join(" ")}
      data-animate={animate ? "true" : "false"}
      style={variables}
    >
      <svg className="abb-outline" aria-hidden="true" focusable="false">
        <rect className="abb-track" pathLength="100" />
        <rect className="abb-highlight" pathLength="100" />
      </svg>
      <span className="abb-content">{children}</span>
    </button>
  );
}

