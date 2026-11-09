import { describe, expect, it } from "vitest";
import { detectBackground, dominantColor, fitInside, removeBackground, visibleBounds } from "./logo-engine";

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
