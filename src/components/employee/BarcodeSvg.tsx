// Renders a Code128 barcode as an SVG for the given value.
// Client-only. Provides a download() ref for saving as .svg or .png.
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function BarcodeSvg({
  value,
  height = 64,
  displayValue = true,
  className,
}: {
  value: string;
  height?: number;
  displayValue?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      lineColor: "#111",
      background: "#ffffff",
      width: 2,
      height,
      margin: 8,
      displayValue,
      fontSize: 14,
      font: "monospace",
      textMargin: 4,
    });
  }, [value, height, displayValue]);
  return <svg ref={ref} className={className} />;
}

// Trigger a download of the barcode as a PNG (preferred for printing on ID cards)
export async function downloadBarcodePng(value: string, filename: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, {
    format: "CODE128",
    lineColor: "#000000",
    background: "#ffffff",
    width: 3,
    height: 120,
    margin: 16,
    displayValue: true,
    fontSize: 20,
    font: "monospace",
    textMargin: 6,
  });
  const xml = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  const scale = 3;
  canvas.width = (img.width || 600) * scale;
  canvas.height = (img.height || 160) * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const pngUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = pngUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
