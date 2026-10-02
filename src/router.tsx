import { lazy } from "react";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, Link, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  const err = error instanceof Error ? error : new Error(String(error));
  const router = useRouter();

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-md border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-normal text-brand">Branta Console</p>
        <h1 className="mt-2 text-[20px] font-semibold">This page didn&apos;t load</h1>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          {err.message || "Something went wrong while opening this page."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-sm bg-brand px-3 py-1.5 text-[12px] font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <Link
            to="/login"
            className="rounded-sm border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-foreground"
          >
            Go to login
          </Link>
        </div>
      </section>
    </main>
  );
}

function DefaultNotFoundComponent() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-md border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-normal text-brand">Branta Console</p>
        <h1 className="mt-2 text-[20px] font-semibold">Page not found</h1>
        <p className="mt-2 text-[12.5px] text-muted-foreground">The page you requested is not available.</p>
        <Link
          to="/login"
          className="mt-5 inline-flex rounded-sm bg-brand px-3 py-1.5 text-[12px] font-semibold text-primary-foreground"
        >
          Go to login
        </Link>
      </section>
    </main>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: lazy(() =>
      Promise.resolve({ default: DefaultErrorComponent }),
    ),
    defaultNotFoundComponent: DefaultNotFoundComponent,
  });

  return router;
};
