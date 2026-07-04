import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import matter from "gray-matter";

export type TemplatePost = {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly body: string;
  readonly isDraft?: boolean;
};

const contentRoot = fileURLToPath(new URL("../content/posts", import.meta.url));
const draftRoot = fileURLToPath(new URL("../content/drafts", import.meta.url));

export async function getPublishedPosts(): Promise<TemplatePost[]> {
  try {
    const files = (await readdir(contentRoot)).filter((file) => file.endsWith(".md"));
    return Promise.all(files.map(readPost));
  } catch {
    return [];
  }
}

async function readPost(fileName: string, isDraft: boolean = false): Promise<TemplatePost> {
  const root = isDraft ? draftRoot : contentRoot;
  const raw = await readFile(join(root, fileName), "utf-8");
  const parsed = matter(raw);
  return {
    title: String(parsed.data.title ?? "Untitled"),
    slug: String(parsed.data.slug ?? fileName.replace(/\.md$/, "")),
    description: String(parsed.data.description ?? ""),
    body: parsed.content,
    isDraft
  };
}

export async function getSearchableContent(isDev: boolean): Promise<TemplatePost[]> {
  const posts = await getPublishedPosts();
  let drafts: TemplatePost[] = [];
  
  if (isDev) {
    try {
      const files = (await readdir(draftRoot)).filter((file) => file.endsWith(".md"));
      drafts = await Promise.all(files.map((f) => readPost(f, true)));
    } catch {
      // no drafts directory
    }
  }

  return [...posts, ...drafts];
}
