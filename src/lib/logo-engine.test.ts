import { describe, expect, it } from "vitest";
import { extractPalette, floodBackground, detectBackground, dominantColor, fitInside, removeBackground, visibleBounds } from "./logo-engine";

function img(w: number, h: number, bg: number[], box?: { x: number; y: number; w: number; h: number; c: number[] }) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inBox = box && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
    d.set(inBox ? box!.c : bg, (y * w + x) * 4);
  }
  return d;
}

describe("logo engine", () => {
  it("removes a white background and crops to the logo", () => {
    const d = img(40, 20, [255, 255, 255, 255], { x: 10, y: 5, w: 8, h: 4, c: [229, 106, 23, 255] });
    const bg = detectBackground(d, 40, 20);
    expect(bg).not.toBeNull();
    removeBackground(d, bg!);
    expect(visibleBounds(d, 40, 20)).toEqual({ x: 10, y: 5, w: 8, h: 4 });
  });
  it("keeps already transparent logos untouched", () => {
    expect(detectBackground(img(20, 20, [0, 0, 0, 0]), 20, 20)).toBeNull();
  });
  it("detects the brand colour, ignoring white and grey", () => {
    const d = img(20, 20, [128, 128, 128, 255], { x: 0, y: 0, w: 5, h: 5, c: [229, 106, 23, 255] });
    expect(dominantColor(d)).toBe("#E56A17");
  });
  it("fits inside the 4:1 box keeping aspect ratio", () => {
    expect(fitInside(400, 400, 1104, 276)).toEqual({ w: 276, h: 276 });
  });
});

import { isLightMonochrome as _ilm, recolorToInk as _rti } from "./logo-engine";
describe("white logo inversion", () => {
  it("detects an all-white logo and recolours it dark", () => {
    const d = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(_ilm(d)).toBe(true);
    _rti(d);
    expect(Array.from(d.slice(0, 4))).toEqual([17, 24, 39, 255]);
  });
  it("leaves coloured logos alone", () => {
    expect(_ilm(new Uint8ClampedArray([229, 106, 23, 255]))).toBe(false);
  });
  it("drops dark fringe pixels", () => {
    const d = new Uint8ClampedArray([30, 30, 30, 120]); _rti(d); expect(d[3]).toBe(0);
  });
});

describe("icon mark extraction", () => {
  const paint = (w: number, h: number, boxes: { x: number; y: number; w: number; h: number }[]) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (const b of boxes) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) d.set([17, 24, 39, 255], (y * w + x) * 4);
    return d;
  };
  it("takes the symbol to the left of the wordmark, ignoring letter gaps", async () => {
    const { findMark } = await import("./logo-engine");
    const d = paint(300, 60, [{ x: 10, y: 5, w: 50, h: 50 }, { x: 90, y: 20, w: 40, h: 20 }, { x: 134, y: 20, w: 40, h: 20 }]);
    expect(findMark(d, 300, 60, { x: 10, y: 5, w: 164, h: 50 })).toEqual({ x: 10, y: 5, w: 50, h: 50 });
  });
  it("takes the symbol stacked above the name", async () => {
    const { findMark } = await import("./logo-engine");
    const d = paint(200, 200, [{ x: 70, y: 10, w: 60, h: 60 }, { x: 20, y: 120, w: 160, h: 30 }]);
    expect(findMark(d, 200, 200, { x: 20, y: 10, w: 160, h: 140 })).toEqual({ x: 70, y: 10, w: 60, h: 60 });
  });
  it("returns null for a plain wordmark", async () => {
    const { findMark } = await import("./logo-engine");
    const d = paint(200, 40, [{ x: 10, y: 10, w: 40, h: 20 }, { x: 54, y: 10, w: 40, h: 20 }]);
    expect(findMark(d, 200, 40, { x: 10, y: 10, w: 84, h: 20 })).toBeNull();
  });
});

import { sharpenAlpha, toSolidWhite } from "./logo-engine";
describe("crisp edges and white footer", () => {
  it("collapses a soft alpha ramp but keeps solid and empty pixels", () => {
    const d = new Uint8ClampedArray([0,0,0,0, 0,0,0,57, 0,0,0,177, 0,0,0,255]);
    sharpenAlpha(d);
    expect([d[3], d[7], d[11], d[15]]).toEqual([0, 0, 255, 255]);
  });
  it("whitens visible pixels only", () => {
    const d = new Uint8ClampedArray([17,24,39,200, 5,5,5,0]);
    toSolidWhite(d);
    expect(Array.from(d)).toEqual([255,255,255,200, 5,5,5,0]);
  });
});

describe("brand palette", () => {
  it("tags the most used colour primary, the next secondary", () => {
    const px = (r: number, g: number, b: number, n: number) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
    const d = new Uint8ClampedArray([...px(124, 77, 255, 60), ...px(17, 24, 39, 300), ...px(16, 185, 129, 20)]);
    const p = extractPalette(d);
    expect(p.map((x) => x.role)).toEqual(["primary", "secondary", "accent"]);
    expect(p[0].hex).toBe("#7C4DFF");
    expect(p[2].hex).toBe("#111827");
  });
  it("removes a gradient background but keeps the sharp logo", () => {
    const w = 40, h = 20, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, logo = x > 15 && x < 25 && y > 6 && y < 14;
      d[i] = logo ? 250 : x * 2; d[i + 1] = logo ? 250 : 5; d[i + 2] = logo ? 250 : 10 + x; d[i + 3] = 255;
    }
    expect(floodBackground(d, w, h)).not.toBeNull();
    expect(d[(10 * w + 20) * 4 + 3]).toBe(255);
    expect(d[3]).toBe(0);
  });
});

describe("logo engine fixes", () => {
  const paint = (d: Uint8ClampedArray, w: number, x0: number, y0: number, bw: number, bh: number, c: number[]) => {
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) d.set(c, (y * w + x) * 4);
  };
  it("finds a mark made of separate pieces before the wordmark", async () => {
    const { findMark } = await import("./logo-engine");
    const w = 300, h = 60, d = new Uint8ClampedArray(w * h * 4), ink = [20, 20, 20, 255];
    paint(d, w, 10, 10, 12, 40, ink); paint(d, w, 26, 10, 12, 40, ink); paint(d, w, 42, 10, 12, 40, ink); // rays, 4px gaps
    for (let i = 0; i < 6; i++) paint(d, w, 90 + i * 30, 10, 26, 40, ink); // letters, 4px gaps; 36px split
    expect(findMark(d, w, h, { x: 10, y: 10, w: 256, h: 40 })).toEqual({ x: 10, y: 10, w: 44, h: 40 });
  });
  it("cuts dark details inside a badge out of the white footer logo, keeps outside ink", async () => {
    const { punchEnclosedDark } = await import("./logo-engine");
    const w = 60, h = 30, d = new Uint8ClampedArray(w * h * 4);
    paint(d, w, 2, 2, 24, 24, [200, 240, 40, 255]); // lime badge
    paint(d, w, 10, 10, 6, 6, [10, 10, 10, 255]); // face inside
    paint(d, w, 34, 8, 20, 14, [10, 10, 10, 255]); // black wordmark
    punchEnclosedDark(d, w, h);
    expect(d[(12 * w + 12) * 4 + 3]).toBe(0);
    expect(d[(10 * w + 40) * 4 + 3]).toBe(255);
  });
  it("keeps white as a palette colour after the brand colour", async () => {
    const { extractPalette } = await import("./logo-engine");
    const d = img(20, 20, [255, 255, 255, 255], { x: 0, y: 0, w: 8, h: 8, c: [146, 105, 244, 255] });
    expect(extractPalette(d).map((p) => p.hex)).toEqual(["#9269F4", "#FFFFFF"]);
  });
});

describe("dark background keeps letters solid", () => {
  it("does not hollow a white letter with a soft edge on a dark background", async () => {
    const { cleanBackground } = await import("./logo-engine");
    const w = 60, h = 40, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // soft ramp 20→240 over 12px around a white block (like a blurred JPEG edge)
      const e = Math.min(x - 14, 46 - x, y - 8, 32 - y);
      const v = Math.max(20, Math.min(240, 130 + e * 18));
      d.set([v, v, v + 8 > 255 ? 255 : v + 8, 255], (y * w + x) * 4);
    }
    cleanBackground(d, w, h, true);
    expect(d[(20 * w + 30) * 4 + 3]).toBe(255);
    expect(d[3]).toBe(0);
  });
});
