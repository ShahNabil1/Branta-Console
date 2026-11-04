import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { useStrictSecurity } from "@/hooks/use-strict-security";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { DevToolsShield } from "@/components/branta/devtools-shield";
import { markBooted } from "@/lib/boot-splash";
import brantaIcon from "@/assets/branta-icon.svg.asset.json";
import { useRouterState } from "@tanstack/react-router";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Error 404
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Route not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The console path you requested does not exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-9 items-center justify-center rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-700"
          >
            Return to console
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(err);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(err, { boundary: "tanstack_root_error_component" });
  }, [err]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Console fault
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          This screen didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-9 items-center justify-center rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-700"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-sm border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Return to console
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#e56a17" },
      { title: "Branta Tech · Console" },
      {
        name: "description",
        content:
          "Branta Tech internal ERP & CRM console. Authorized personnel only.",
      },
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
      { name: "googlebot", content: "noindex, nofollow, noarchive, nosnippet" },
      // Prevent Chrome/Edge auto-translate from mutating the DOM under React,
      // which causes intermittent "removeChild ... not a child of this node" crashes.
      { name: "google", content: "notranslate" },
      { property: "og:title", content: "Branta Tech · Console" },
      {
        property: "og:description",
        content: "Branta Tech internal ERP & CRM console. Authorized personnel only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Branta Tech · Console" },
      { name: "twitter:description", content: "Branta Tech internal ERP & CRM console. Authorized personnel only." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/20735de1-61d9-4235-909c-6401c74bf49f/id-preview-6867991c--0b934a6f-9f9d-47f8-b76c-960a68b43f5a.lovable.app-1784071904431.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/20735de1-61d9-4235-909c-6401c74bf49f/id-preview-6867991c--0b934a6f-9f9d-47f8-b76c-960a68b43f5a.lovable.app-1784071904431.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "96x96", href: "/favicon-96x96.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: lazy(() => Promise.resolve({ default: ErrorComponent })),
});

const BOOT_CSS = `html,body{background:#F9FAFB}
#boot-splash{position:fixed;inset:0;z-index:2147482999;display:grid;place-items:center;background-color:#F9FAFB;background-image:radial-gradient(60% 50% at 12% 10%,rgba(229,106,23,.16),transparent 70%),radial-gradient(55% 45% at 90% 15%,rgba(6,182,212,.14),transparent 70%),radial-gradient(60% 50% at 85% 90%,rgba(99,102,241,.14),transparent 70%),radial-gradient(50% 45% at 10% 88%,rgba(16,185,129,.12),transparent 70%),linear-gradient(160deg,#FFFFFF 0%,#F9FAFB 55%,#FFF7F0 100%)}
#boot-splash .bs-node{position:relative;width:calc(clamp(220px,min(46vw,60vh),520px)*.16);aspect-ratio:1;display:grid;place-items:center}
#boot-splash .bs-ring{position:absolute;inset:-18%;border-radius:50%;border:2px solid rgba(229,106,23,.5);animation:bs-ring 2s ease-out infinite}
#boot-splash .bs-core{position:relative;width:100%;height:100%;border-radius:50%;background:#E56A17;box-shadow:0 0 0 5px #fff,0 10px 30px rgba(229,106,23,.35);display:grid;place-items:center;animation:bs-core 2s cubic-bezier(.3,1.4,.5,1) infinite}
#boot-splash img{width:100%;height:100%;object-fit:cover;border-radius:50%}
@keyframes bs-core{0%{transform:scale(.6);opacity:0}20%,80%{transform:scale(1);opacity:1}100%{transform:scale(.96);opacity:1}}
@keyframes bs-ring{0%,25%{transform:scale(.5);opacity:0}45%{transform:scale(1);opacity:1}60%{transform:scale(.94);opacity:.8}75%{transform:scale(1);opacity:1}100%{transform:scale(2.6);opacity:0}}
@media (prefers-reduced-motion:reduce){#boot-splash *{animation:none!important}}
html[data-booted] #boot-splash{display:none}`;


function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" translate="no" className="notranslate">
      <head>
        <HeadContent />
        {/* Boot splash: painted from the very first HTML byte so the domain never shows a white screen. */}
        <style dangerouslySetInnerHTML={{ __html: BOOT_CSS }} />
      </head>
      <body translate="no" className="notranslate">
        <div id="boot-splash" aria-hidden="true">
          <div className="bs-node">
            <div className="bs-ring" />
            <div className="bs-core"><img src={brantaIcon.url} alt="" /></div>
          </div>
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useStrictSecurity();
  // Non-app screens (login etc.) hide the boot splash once the router settles;
  // /app hands off to the full preloader, which hides it on mount.
  const settled = useRouterState({
    select: (s) => s.status === "idle" && !s.isLoading && !s.location.pathname.startsWith("/app") && s.location.pathname !== "/",
  });
  useEffect(() => { if (settled) markBooted(); }, [settled]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED" &&
        event !== "MFA_CHALLENGE_VERIFIED"
      )
        return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <DevToolsShield>
          <Outlet />
        </DevToolsShield>
        <Toaster position="bottom-right" />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

