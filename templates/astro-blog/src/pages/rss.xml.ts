import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getBlogUrl, getPublishedPosts, getSiteSettings } from "../template/posts";

export const GET: APIRoute = async (context) => {
  const [posts, settings] = await Promise.all([getPublishedPosts(), getSiteSettings()]);
  return rss({
    title: settings.title,
    description: settings.description,
    site: context.site ?? settings.canonicalUrl,
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: post.publishedAt,
      link: getBlogUrl(settings, post.slug, import.meta.env.BASE_URL)
    }))
  });
};
