import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getPublishedPosts } from "../template/posts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const GET: APIRoute = async (context) => {
  const posts = await getPublishedPosts();

  let title = "Ilm Blog";
  let description = "A user-owned Ilm blog";

  try {
    const configPath = fileURLToPath(new URL("../../../config/seo.ts", import.meta.url));
    const content = readFileSync(configPath, "utf-8");
    const titleMatch = content.match(/defaultTitle:\s*["']([^"']+)["']/);
    const descMatch = content.match(/defaultDescription:\s*["']([^"']+)["']/);
    if (titleMatch && titleMatch[1]) title = titleMatch[1];
    if (descMatch && descMatch[1]) description = descMatch[1];
  } catch {
    // fallback
  }

  return rss({
    title,
    description,
    site: context.site || "https://example.com",
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: new Date(), // We would parse frontmatter pubDate ideally, using Date.now fallback
      link: `/posts/${post.slug}/`
    }))
  });
};
