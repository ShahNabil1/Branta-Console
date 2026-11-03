// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

const tslibEsm = fileURLToPath(new URL("./node_modules/tslib/tslib.es6.js", import.meta.url));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    resolve: {
      alias: [{ find: /^tslib$/, replacement: tslibEsm }],
    },
    ssr: {
      noExternal: ["tslib", "pdf-lib", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
    },
  },
});
