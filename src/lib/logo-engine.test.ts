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
