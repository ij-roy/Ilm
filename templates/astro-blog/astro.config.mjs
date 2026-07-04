/* global URL */
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let siteUrl = "https://example.com";
try {
  const configPath = fileURLToPath(new URL("../../../config/seo.ts", import.meta.url));
  const content = readFileSync(configPath, "utf-8");
  const match = content.match(/canonicalBaseUrl:\s*["']([^"']+)["']/);
  if (match && match[1]) {
    siteUrl = match[1];
  }
} catch {
  // fallback to example.com
}

export default defineConfig({
  outDir: "./dist",
  site: siteUrl,
  integrations: [sitemap()]
});
