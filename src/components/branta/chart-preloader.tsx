import { useEffect } from "react";
import { markBooted } from "@/lib/boot-splash";
import { BRAND_LOGO } from "@/lib/brand-assets";
import "./chart-preloader.css";

/** Minimum time the loading screen stays up after sign-in, in ms. */
export const PRELOADER_CYCLE_MS = 1200;

/** Plain white loading screen with the full Branta Tech logo. */
export function ChartPreloader({ leaving = false }: { leaving?: boolean }) {
  useEffect(() => { markBooted(); }, []);
  return (
    <div
      className="preloader-screen transition-opacity duration-300"
      style={{ opacity: leaving ? 0 : 1 }}
      role="status"
      aria-label="Loading"
    >
      <div className="preloader-wrap">
        <img src={BRAND_LOGO.url} alt="Branta Tech" />
        <div className="preloader-bar" />
      </div>
    </div>
  );
}
