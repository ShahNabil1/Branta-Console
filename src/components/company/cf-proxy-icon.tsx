import { cn } from "@/lib/utils";

/** Cloudflare dashboard proxy-status cloud: orange with the arrow through it (Proxied) or grey with the arrow passing under it (DNS only). */
export function CfProxyIcon({ proxied, className }: { proxied: boolean; className?: string }) {
  const cloud = "M6.5 15.5h11.2a3.3 3.3 0 0 0 .4-6.57A5 5 0 0 0 8.4 7.6a3.95 3.95 0 0 0-1.9 7.9z";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("shrink-0", proxied ? "w-[1.6em]" : "w-[1.6em]", "h-[1.15em]", className)}>
      {proxied ? (
        <>
          <path d={cloud} fill="#F38020" />
          <path d="M2 12.4h17.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M16.6 9.9l2.7 2.5-2.7 2.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d={cloud} fill="#9CA3AF" transform="translate(0 -2.5)" />
          <path d="M2 18.6h18.8" stroke="#9CA3AF" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M18.4 16.1l2.7 2.5-2.7 2.5" fill="none" stroke="#9CA3AF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
