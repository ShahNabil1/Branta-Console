import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChartPreloader, PRELOADER_CYCLE_MS, PRELOADER_VARIANTS, type PreloaderVariant } from "@/components/branta/chart-preloader";

export const Route = createFileRoute("/preloader-preview")({
  head: () => ({
    meta: [
      { title: "Preloader preview · Branta Tech Console" },
      { name: "description", content: "Looping preview of the Branta Console preloader with pause and step controls." },
      { property: "og:title", content: "Preloader preview · Branta Tech Console" },
      { property: "og:description", content: "Looping preview of the Branta Console preloader with pause and step controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreloaderPreview,
});

function PreloaderPreview() {
  const [cycle, setCycle] = useState(PRELOADER_CYCLE_MS);
  const [t, setT] = useState(0);
  const [variant, setVariant] = useState<PreloaderVariant>("dissolve");
  const [playing, setPlaying] = useState(true);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null) {
        const dt = now - last.current;
        setT((p) => (p + dt) % cycle);
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, cycle]);

  const pct = Math.round((t / cycle) * 100);
  const step = (ms: number) => { setPlaying(false); setT((p) => (p + ms + cycle) % cycle); };

  return (
    <>
      <ChartPreloader key={variant} variant={variant} scrubAt={t} speedMs={cycle} />
      <div
        className="fixed inset-x-0 bottom-4 mx-auto flex w-[min(720px,calc(100vw-24px))] flex-wrap items-center gap-3 rounded border border-border bg-card px-4 py-3 text-[13px] shadow-lg"
        style={{ zIndex: 2147483600 }}
      >
        <div className="flex w-full gap-1">
          {PRELOADER_VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => { setVariant(v.id); setT(0); setPlaying(true); }}
              className={`flex-1 rounded border px-2 py-1 font-semibold ${variant === v.id ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button className="rounded border border-border px-3 py-1 font-semibold" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button className="rounded border border-border px-2 py-1" onClick={() => step(-100)}>−0.1s</button>
        <button className="rounded border border-border px-2 py-1" onClick={() => step(100)}>+0.1s</button>
        <input
          type="range" min={0} max={cycle} step={10} value={t}
          onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
          className="min-w-[160px] flex-1 accent-primary"
          aria-label="Timeline"
        />
        <span className="font-mono tabular-nums">{(t / 1000).toFixed(2)}s · {pct}%</span>
        <label className="flex items-center gap-1 text-muted-foreground">
          Cycle
          <select className="rounded border border-border bg-card px-1 py-0.5" value={cycle} onChange={(e) => { setCycle(Number(e.target.value)); setT(0); }}>
            {[3550, 5000, 7000, 9000, 12000].map((v) => <option key={v} value={v}>{v / 1000}s</option>)}
          </select>
        </label>
      </div>
    </>
  );
}
