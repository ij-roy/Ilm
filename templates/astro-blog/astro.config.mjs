import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

let siteUrl = "https://example.com/";
try {
  const content = readFileSync(join(process.cwd(), "config", "site.json"), "utf-8");
  siteUrl = JSON.parse(content).canonicalUrl;
} catch {
  // fallback to example.com
}

export default defineConfig({
  outDir: "./dist",
  site: siteUrl,
  base: new globalThis.URL(siteUrl).pathname,
  integrations: [sitemap()]
});
