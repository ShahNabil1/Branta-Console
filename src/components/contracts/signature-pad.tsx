import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Draw-or-type signature; reports a PNG data URL (or null when empty). */
export function SignaturePad({ onChange, typedName }: { onChange: (png: string | null) => void; typedName?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [dirty, setDirty] = useState(false);

  const ctx = () => {
    const c = ref.current!; const g = c.getContext("2d")!;
    g.lineWidth = 2.4; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#111827";
    return g;
  };
  const clear = () => { const c = ref.current; if (!c) return; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setDirty(false); onChange(null); };
  useEffect(() => {
    if (mode !== "type") return;
    const c = ref.current; if (!c) return;
    const g = c.getContext("2d")!; g.clearRect(0, 0, c.width, c.height);
    if (!typedName?.trim()) { onChange(null); return; }
    g.fillStyle = "#111827"; g.font = "italic 64px 'Brush Script MT', 'Segoe Script', cursive"; g.textBaseline = "middle";
    g.fillText(typedName.trim(), 24, c.height / 2, c.width - 48);
    onChange(c.toDataURL("image/png"));
  }, [mode, typedName]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.PointerEvent) => { const c = ref.current!; const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height] as const; };

  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-[12.5px]">
        {(["draw", "type"] as const).map((m) => (
          <button key={m} type="button" onClick={() => { clear(); setMode(m); }} className={`rounded-full px-3 py-1 ${mode === m ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>{m === "draw" ? "Draw" : "Type"}</button>
        ))}
      </div>
      <canvas
        ref={ref} width={900} height={240}
        className="h-[120px] w-full touch-none rounded-xl border border-dashed border-border bg-background"
        onPointerDown={(e) => { if (mode !== "draw") return; drawing.current = true; const [x, y] = pos(e); const g = ctx(); g.beginPath(); g.moveTo(x, y); (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drawing.current) return; const [x, y] = pos(e); const g = ctx(); g.lineTo(x, y); g.stroke(); setDirty(true); }}
        onPointerUp={() => { if (!drawing.current) return; drawing.current = false; if (ref.current) onChange(ref.current.toDataURL("image/png")); }}
      />
      {mode === "draw" && <div className="flex items-center justify-between text-[12px] text-muted-foreground"><span>Sign inside the box</span>{dirty && <Button type="button" size="sm" variant="ghost" onClick={clear}>Clear</Button>}</div>}
    </div>
  );
}
