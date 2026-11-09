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

/** True when every visible pixel is a light grey/white (a white logo made for dark backgrounds). */
export function isLightMonochrome(d: Px): boolean {
  let n = 0, light = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) return false;
    n++; if ((r + g + b) / 3 > 200) light++;
  }
  return n > 0 && light >= n * 0.9;
}

/** Recolours a white logo to a solid dark ink; brightness becomes coverage so dark JPEG fringes disappear (in place). */
export function recolorToInk(d: Px, ink: [number, number, number] = [17, 24, 39]) {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 765;
    d[i] = ink[0]; d[i + 1] = ink[1]; d[i + 2] = ink[2];
    d[i + 3] = Math.round(d[i + 3] * Math.min(1, Math.max(0, (lum - 0.15) / 0.75)));
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
  type Bin = { n: number; r: number; g: number; b: number };
  const bins = new Map<number, Bin>();
  const neutral = new Map<number, Bin>();
  const add = (m: Map<number, Bin>, r: number, g: number, b: number) => {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = m.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; m.set(key, e);
  };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    // Colourful pixels win; monochrome logos (black/grey ink) fall back to their real ink colour.
    add(max < 40 || max - min < 40 ? neutral : bins, r, g, b);
  }
  let best: Bin | null = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  if (!best) for (const e of neutral.values()) if (!best || e.n > best.n) best = e;
  if (!best) return null;
  const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`.toUpperCase();
}

/** Scale to fit (w,h) inside a box while keeping the aspect ratio. */
export function fitInside(w: number, h: number, boxW: number, boxH: number) {
  const s = Math.min(boxW / w, boxH / h);
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

/** Tightens the soft alpha ramp left by upscaling into a crisp ~1px anti-aliased edge (in place). */
export function sharpenAlpha(d: Px, center = 120, width = 40) {
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (a === 0 || a === 255) continue;
    d[i] = Math.round(Math.min(1, Math.max(0, (a - (center - width)) / (2 * width))) * 255);
  }
}

/** Turns every visible pixel pure white #FFFFFF, keeping the alpha (in place). */
export function toSolidWhite(d: Px) {
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
}

/** Draws a crop scaled into the canvas, then sharpens edges (and optionally whitens). */
function drawCrisp(o: CanvasRenderingContext2D, src: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }, dx: number, dy: number, dw: number, dh: number, W: number, H: number, white = false) {
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = "high";
  o.drawImage(src, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
  const img = o.getImageData(0, 0, W, H);
  if (dw > box.w * 1.15 || dh > box.h * 1.15) sharpenAlpha(img.data);
  if (white) toSolidWhite(img.data);
  o.putImageData(img, 0, 0);
}

export const FOOTER_W = 800;
export const FOOTER_H = 200;

export type LogoStage = "read" | "background" | "crop" | "color" | "upload";
export type LogoResult = { blob: Blob; color: string | null; removedBackground: boolean; inverted: boolean };

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
export async function processLogo(file: File | Blob, onStage: (s: LogoStage, p: number) => void, signal?: AbortSignal, opts: { w?: number; h?: number; white?: boolean } = {}): Promise<LogoResult> {
  const LW = opts.w ?? LOGO_W, LH = opts.h ?? LOGO_H;
  const check = () => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
  onStage("read", 0.2);
  const img = await decode(file as File); check();
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
  const inverted = isLightMonochrome(data.data);
  if (inverted && !opts.white) recolorToInk(data.data);
  ctx.putImageData(data, 0, 0);
  onStage("background", 1); await tick(); check();

  onStage("crop", 0.3); await tick();
  const box = visibleBounds(data.data, w, h);
  if (!box) throw new Error("The logo looks empty after removing the background.");
  const out = document.createElement("canvas");
  out.width = LW; out.height = LH;
  const o = out.getContext("2d", { willReadFrequently: true });
  if (!o) throw new Error("Your browser blocked image processing.");
  const fit = fitInside(box.w, box.h, LW * (1 - LOGO_PAD * 2), LH * (1 - LOGO_PAD * 2));
  drawCrisp(o, src, box, Math.round((LW - fit.w) / 2), Math.round((LH - fit.h) / 2), fit.w, fit.h, LW, LH, opts.white);
  onStage("crop", 1); await tick(); check();

  onStage("color", 0.4); await tick();
  const color = opts.white ? null : dominantColor(o.getImageData(0, 0, LW, LH).data);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not create the PNG.");
  onStage("color", 1); check();
  return { blob, color, removedBackground: !!bg, inverted };
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

// ---------- Phase 2: square icon (512×512) ----------
export const ICON_SIZE = 512;
/** Safe padding per side so rounded-md / rounded-full crops never cut the mark. */
export const ICON_PAD = 0.16;

type Box = { x: number; y: number; w: number; h: number };

/** Splits a 1-D occupancy profile into runs, merging gaps smaller than `minGap`. */
export function runs(profile: number[], minGap: number): [number, number][] {
  const out: [number, number][] = [];
  let s = -1, lastOn = -1;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] > 0) {
      if (s < 0) s = i;
      else if (i - lastOn - 1 >= minGap) { out.push([s, lastOn]); s = i; }
      lastOn = i;
    }
  }
  if (s >= 0) out.push([s, lastOn]);
  return out;
}

/**
 * Finds the symbol part of a combination logo (mark beside or above the wordmark).
 * Returns null when no clear separation exists.
 */
export function findMark(d: Px, w: number, h: number, box: Box, min = 30): Box | null {
  const col = new Array(box.w).fill(0), row = new Array(box.h).fill(0);
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    if (d[(y * w + x) * 4 + 3] > min) { col[x - box.x]++; row[y - box.y]++; }
  }
  const tighten = (x0: number, x1: number, y0: number, y1: number): Box | null => {
    let mx = Infinity, my = Infinity, Mx = -1, My = -1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (d[(y * w + x) * 4 + 3] > min) {
      if (x < mx) mx = x; if (x > Mx) Mx = x; if (y < my) my = y; if (y > My) My = y;
    }
    return Mx < 0 ? null : { x: mx, y: my, w: Mx - mx + 1, h: My - my + 1 };
  };
  // The first gap must clearly dominate the letter spacing to count as the mark/name split.
  const split = (prof: number[], extent: number): [number, number] | null => {
    const r = runs(prof, 1);
    if (r.length < 2) return null;
    const gaps = r.slice(1).map((x, i) => x[0] - r[i][1] - 1);
    const rest = Math.max(0, ...gaps.slice(1));
    if (gaps[0] < Math.max(4, extent * 0.08)) return null;
    if (rest ? gaps[0] < rest * 1.8 : gaps[0] < extent * 0.25) return null;
    return r[0];
  };
  const c = split(col, box.h);
  if (c) return tighten(box.x + c[0], box.x + c[1], box.y, box.y + box.h - 1);
  const v = split(row, box.w);
  if (v) return tighten(box.x, box.x + box.w - 1, box.y + v[0], box.y + v[1]);
  return null;
}

export type IconResult = { blob: Blob; color: string | null; extracted: boolean; inverted: boolean };

/** Builds the 512×512 transparent PNG icon. `extract` cuts the mark out of a full logo. */
export async function processIcon(file: Blob, extract: boolean, onStage: (s: LogoStage, p: number) => void, signal?: AbortSignal): Promise<IconResult> {
  const check = () => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
  onStage("read", 0.2);
  const img = await decode(file as File); check();
  const iw = img.naturalWidth || 512, ih = img.naturalHeight || 512;
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
  const inverted = isLightMonochrome(data.data);
  if (inverted) recolorToInk(data.data);
  ctx.putImageData(data, 0, 0);
  onStage("background", 1); await tick(); check();

  onStage("crop", 0.3); await tick();
  const all = visibleBounds(data.data, w, h);
  if (!all) throw new Error("The image looks empty after removing the background.");
  let box: Box = all;
  if (extract) {
    const mark = findMark(data.data, w, h, all);
    if (!mark) throw new Error("Couldn't find a separate symbol in this logo — upload an icon file instead.");
    box = mark;
  }
  const out = document.createElement("canvas");
  out.width = ICON_SIZE; out.height = ICON_SIZE;
  const o = out.getContext("2d", { willReadFrequently: true });
  if (!o) throw new Error("Your browser blocked image processing.");
  const inner = ICON_SIZE * (1 - ICON_PAD * 2);
  const fit = fitInside(box.w, box.h, inner, inner);
  drawCrisp(o, src, box, Math.round((ICON_SIZE - fit.w) / 2), Math.round((ICON_SIZE - fit.h) / 2), fit.w, fit.h, ICON_SIZE, ICON_SIZE);
  onStage("crop", 1); await tick(); check();

  onStage("color", 0.4); await tick();
  const color = dominantColor(o.getImageData(0, 0, ICON_SIZE, ICON_SIZE).data);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not create the PNG.");
  onStage("color", 1); check();
  return { blob, color, extracted: extract, inverted };
}

/** Invoice footer logo: same pipeline as the main logo, 800×200, every visible pixel pure #FFFFFF. */
export function processFooterLogo(file: File | Blob, onStage: (s: LogoStage, p: number) => void, signal?: AbortSignal) {
  return processLogo(file, onStage, signal, { w: FOOTER_W, h: FOOTER_H, white: true });
}
