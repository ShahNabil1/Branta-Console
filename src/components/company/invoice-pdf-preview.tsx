import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export function InvoicePdfPreview({ pdf, zoom }: { pdf: string; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];
    let destroy: (() => Promise<void>) | undefined;
    setBusy(true); setError("");
    async function render() {
      const lib = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      const loading = lib.getDocument({ data: Uint8Array.from(atob(pdf), c => c.charCodeAt(0)), isEvalSupported: false });
      destroy = () => loading.destroy();
      const doc = await loading.promise;
      if (cancelled || !ref.current) { await doc.destroy(); return; }
      ref.current.replaceChildren();
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelled || !ref.current) return;
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: zoom / 100 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width * 1.5); canvas.height = Math.ceil(viewport.height * 1.5);
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        canvas.className = "mx-auto max-w-none shadow-panel";
        canvas.setAttribute("aria-label", `Invoice page ${n} of ${doc.numPages}`);
        ref.current.appendChild(canvas);
        const task = page.render({ canvas, viewport, transform: [1.5, 0, 0, 1.5, 0, 0] });
        tasks.push(task);
        await task.promise;
      }
      if (!cancelled) setBusy(false);
    }
    render().catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : "Unable to display PDF"); setBusy(false); } });
    return () => { cancelled = true; tasks.forEach(t => t.cancel()); void destroy?.(); };
  }, [pdf, zoom]);
  return <div className="relative min-h-96 overflow-auto bg-muted p-4">
    {busy && <div className="absolute inset-x-0 top-4 z-10 flex justify-center"><Loader2 className="size-5 animate-spin text-brand" /></div>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div ref={ref} className="space-y-4" />
  </div>;
}