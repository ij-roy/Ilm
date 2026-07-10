import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getPublishedPosts, getSeoConfigPath } from "../template/posts";
import { readFileSync } from "node:fs";

export const GET: APIRoute = async (context) => {
  const posts = await getPublishedPosts();

  let title = "Ilm Blog";
  let description = "A user-owned Ilm blog";

  try {
    const content = readFileSync(getSeoConfigPath(), "utf-8");
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
      link: `/blogs/${post.slug}/`
    }))
  });
};
