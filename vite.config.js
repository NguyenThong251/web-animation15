import { defineConfig } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// <!--#include src/partials/x.html--> → file contents (missing file → comment),
// so each section owns its own markup while index.html stays the single page.
function htmlIncludes() {
  const re = /<!--#include\s+([^\s]+)\s*-->/g;
  const expand = (html, depth = 0) =>
    depth > 4
      ? html
      : html.replace(re, (_, p) => {
          const file = resolve(__dirname, p);
          return existsSync(file) ? expand(readFileSync(file, "utf8"), depth + 1) : `<!-- missing partial: ${p} -->`;
        });
  return {
    name: "html-includes",
    transformIndexHtml: { order: "pre", handler: (html) => expand(html) },
    handleHotUpdate({ file, server }) {
      if (file.includes("/src/partials/")) server.ws.send({ type: "full-reload" });
    },
  };
}

export default defineConfig({
  base: "./", // relative URLs → works under the GitHub Pages /web-animation15/ subpath with no rewriting
  plugins: [htmlIncludes()],
  build: { target: "es2022", assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  server: { host: "0.0.0.0" },
});
