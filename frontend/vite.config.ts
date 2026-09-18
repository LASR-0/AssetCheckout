import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

///  +-----------------------------------------------------------------+
///  |            START THE ICON FONT WITH THE STYLESHEET              |
///  +-----------------------------------------------------------------+
//
//  The icon face is declared in styles/material-symbols.css with
//  `font-display: block`, which means icons stay INVISIBLE until the font
//  lands rather than flashing their own ligature text ("error", "close") the
//  way they used to. That is the right trade, but it puts first icon paint
//  directly on the critical path of that one request — and the browser cannot
//  discover it until it has downloaded and parsed the stylesheet that
//  references it. Two serialised round trips for something we know the name
//  of at build time.
//
//  This injects a preload so the font is fetched in PARALLEL with the CSS
//  instead of after it. It cannot be written by hand in index.html because
//  the filename carries a content hash, which is also what lets the asset be
//  served immutable — see the static handler in backend/src/server.ts.
//
//  `crossorigin` is not optional, even though the font is same-origin: fonts
//  are always fetched in CORS mode, and a preload whose mode does not match
//  the real request is silently discarded and fetched a second time.
function preloadIconFont() {
  return {
    name: "preload-icon-font",
    apply: "build" as const,
    transformIndexHtml(html: string, ctx: { bundle?: Record<string, unknown> }) {
      const file = Object.keys(ctx.bundle ?? {}).find((name) =>
        /material-symbols-subset-.*\.woff2$/.test(name)
      );

      // No font in the bundle is a broken build, not something to paper over
      // with a missing tag — but failing the build here would be a worse
      // trade than shipping without the hint, so it just does nothing.
      if (!file) return html;

      return {
        html,
        tags: [
          {
            tag: "link",
            attrs: {
              rel: "preload",
              as: "font",
              type: "font/woff2",
              href: `/${file}`,
              crossorigin: "",
            },
            injectTo: "head-prepend" as const,
          },
        ],
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    plugins: [react(), tailwindcss(), preloadIconFont()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
        },
      },
    },
  };
});
