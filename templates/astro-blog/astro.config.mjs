import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

let siteUrl = "https://example.com";
try {
  const content = readFileSync(join(process.cwd(), "config", "seo.ts"), "utf-8");
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
