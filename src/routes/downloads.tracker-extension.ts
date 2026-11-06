import { createFileRoute } from "@tanstack/react-router";
import { TRACKER_VERSION, trackerZipKey } from "@/lib/tracker-release";

// Tracker extension ZIPs live in Cloudflare R2 (not in the repo); this redirects to the public R2 object.
export const Route = createFileRoute("/downloads/tracker-extension")({
  server: {
    handlers: {
      GET: async () => {
        const base = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
        if (!base) return new Response("Download is not available right now.", { status: 503 });
        return new Response(null, {
          status: 302,
          headers: { Location: `${base}/${trackerZipKey(TRACKER_VERSION)}`, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
