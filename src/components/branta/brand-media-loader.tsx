import brantaIcon from "@/assets/companies/branta-icon.png.asset.json";
import "./brand-media-loader.css";

export function BrandMediaLoader() {
  return <div role="status" aria-label="Loading receipt" className="relative grid size-14 shrink-0 place-items-center">
    <span className="brand-media-loader-ring absolute -inset-[18%] rounded-full border-2 border-brand/50" />
    <span className="brand-media-loader-core relative grid size-full place-items-center overflow-hidden rounded-full border border-border bg-brand ring-4 ring-card">
      <img src={brantaIcon.url} alt="" className="size-full rounded-full object-cover" />
    </span>
  </div>;
}