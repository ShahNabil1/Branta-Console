// Browser-only: collects high-entropy User-Agent Client Hints (real Android
// model + version, real Windows 11) which Chrome hides from the plain UA.
// Safari/iOS has no Client Hints; we only fix the iPad-as-Mac case.
export type DeviceHints = {
  model?: string;
  platform?: string;
  platformVersion?: string;
  mobile?: boolean;
  ipad?: boolean;
};

type UAData = {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (h: string[]) => Promise<Record<string, unknown>>;
};

export async function collectDeviceHints(): Promise<DeviceHints> {
  if (typeof navigator === "undefined") return {};
  const out: DeviceHints = {};
  try {
    const uad = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
    if (uad) {
      out.mobile = !!uad.mobile;
      out.platform = uad.platform || undefined;
      const hv: Record<string, unknown> = await Promise.race<Record<string, unknown>>([
        uad.getHighEntropyValues?.(["model", "platformVersion"]) ?? Promise.resolve<Record<string, unknown>>({}),
        new Promise<Record<string, unknown>>((r) => setTimeout(() => r({}), 800)),
      ]);
      if (typeof hv.model === "string" && hv.model) out.model = hv.model.slice(0, 80);
      if (typeof hv.platformVersion === "string") out.platformVersion = hv.platformVersion.slice(0, 20);
    }
    if (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) out.ipad = true;
  } catch {
    /* hints are best-effort */
  }
  return out;
}
