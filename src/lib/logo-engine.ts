/**
 * Browser-side logo pipeline (no AI, no server): decode any image → remove a flat
 * background → tight-crop → fit on a 1200×300 transparent PNG → detect brand colour.
 * Pixel helpers are pure so they can be unit-tested without a canvas.
 */
export const LOGO_W = 1200;
export const LOGO_H = 300;
/** Breathing room kept inside the 4:1 canvas (fraction of each side). */
export const LOGO_PAD = 0.04;

type Px = Uint8ClampedArray;

/** Average colour of the outer border when it is one flat colour; null if already transparent or busy. */
export function detectBackground(d: Px, w: number, h: number): [number, number, number] | null {
  const pts: number[] = [];
  const stepX = Math.max(1, Math.floor(w / 40)), stepY = Math.max(1, Math.floor(h / 40));
  for (let x = 0; x < w; x += stepX) pts.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y += stepY) pts.push(y * w, y * w + w - 1);
  let transparent = 0, r = 0, g = 0, b = 0, n = 0;
  for (const p of pts) {
    const i = p * 4;
    if (d[i + 3] < 16) { transparent++; continue; }
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  if (transparent > pts.length * 0.5 || !n) return null;
  const avg: [number, number, number] = [r / n, g / n, b / n];
  let close = 0;
  for (const p of pts) { const i = p * 4; if (d[i + 3] >= 16 && dist(d, i, avg) < 40) close++; }
  return close >= n * 0.8 ? avg : null;
}

function dist(d: Px, i: number, c: [number, number, number]) {
  return Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);
}

/** Makes background-coloured pixels transparent with a soft edge (in place). */
export function removeBackground(d: Px, bg: [number, number, number], hard = 28, soft = 70) {
  for (let i = 0; i < d.length; i += 4) {
    const k = dist(d, i, bg);
    if (k <= hard) d[i + 3] = 0;
    else if (k < soft) d[i + 3] = Math.round(d[i + 3] * ((k - hard) / (soft - hard)));
  }
}

/** Tight bounding box of visible pixels; null when the image is empty. */
export function visibleBounds(d: Px, w: number, h: number, min = 12) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Most common saturated colour (ignores white/black/greys); null for monochrome logos. */
export function dominantColor(d: Px): string | null {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 40 || max - min < 40) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; bins.set(key, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  if (!best) return null;
  const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`.toUpperCase();
}

/** Scale to fit (w,h) inside a box while keeping the aspect ratio. */
export function fitInside(w: number, h: number, boxW: number, boxH: number) {
  const s = Math.min(boxW / w, boxH / h);
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

export type LogoStage = "read" | "background" | "crop" | "color" | "upload";
export type LogoResult = { blob: Blob; color: string | null; removedBackground: boolean };

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("This image format can't be read by your browser. Try PNG, JPG, WEBP or SVG.");
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** Runs the full logo pipeline, reporting each stage (0–1 within the stage). */
export async function processLogo(file: File, onStage: (s: LogoStage, p: number) => void, signal?: AbortSignal): Promise<LogoResult> {
  const check = () => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
  onStage("read", 0.2);
  const img = await decode(file); check();
  // SVGs without intrinsic size decode as 0×0 → give them a sensible raster size.
  const iw = img.naturalWidth || 1200, ih = img.naturalHeight || 300;
  const scale = Math.min(1, 2400 / Math.max(iw, ih)) * (Math.max(iw, ih) < 600 ? 600 / Math.max(iw, ih) : 1);
  const w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  const ctx = src.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser blocked image processing.");
  ctx.drawImage(img, 0, 0, w, h);
  onStage("read", 1); await tick(); check();

  const data = ctx.getImageData(0, 0, w, h);
  onStage("background", 0.3); await tick();
  const bg = detectBackground(data.data, w, h);
  if (bg) removeBackground(data.data, bg);
  ctx.putImageData(data, 0, 0);
  onStage("background", 1); await tick(); check();

  onStage("crop", 0.3); await tick();
  const box = visibleBounds(data.data, w, h);
  if (!box) throw new Error("The logo looks empty after removing the background.");
  const out = document.createElement("canvas");
  out.width = LOGO_W; out.height = LOGO_H;
  const o = out.getContext("2d");
  if (!o) throw new Error("Your browser blocked image processing.");
  o.imageSmoothingQuality = "high";
  const fit = fitInside(box.w, box.h, LOGO_W * (1 - LOGO_PAD * 2), LOGO_H * (1 - LOGO_PAD * 2));
  o.drawImage(src, box.x, box.y, box.w, box.h, Math.round((LOGO_W - fit.w) / 2), Math.round((LOGO_H - fit.h) / 2), fit.w, fit.h);
  onStage("crop", 1); await tick(); check();

  onStage("color", 0.4); await tick();
  const color = dominantColor(o.getImageData(0, 0, LOGO_W, LOGO_H).data);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not create the PNG.");
  onStage("color", 1); check();
  return { blob, color, removedBackground: !!bg };
}

/** PUT with real upload progress (fetch has none). */
export function putWithProgress(url: string, blob: Blob, onProgress: (p: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", blob.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error while uploading to storage."));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(blob);
  });
}
