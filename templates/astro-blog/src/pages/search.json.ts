import type { APIRoute } from 'astro';
import { getSearchableContent } from '../template/posts';

export const GET: APIRoute = async () => {
  const isDev = import.meta.env.DEV;
  const posts = await getSearchableContent(isDev);
  
  // We strip down the index to just what we need to search
  const index = posts.map(post => ({
    title: post.title,
    slug: post.slug,
    description: post.description,
    // we could truncate body to keep index small, but since it's SSG we'll include it for full text search
    body: post.body,
    isDraft: post.isDraft
  }));

  return new Response(
    JSON.stringify(index),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
};
