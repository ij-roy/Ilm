import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import matter from "gray-matter";

export type TemplatePost = {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly body: string;
};

const contentRoot = fileURLToPath(new URL("../content/posts", import.meta.url));

export async function getPublishedPosts(): Promise<TemplatePost[]> {
  try {
    const files = (await readdir(contentRoot)).filter((file) => file.endsWith(".md"));
    return Promise.all(files.map(readPost));
  } catch {
    return [];
  }
}

async function readPost(fileName: string): Promise<TemplatePost> {
  const raw = await readFile(join(contentRoot, fileName), "utf-8");
  const parsed = matter(raw);
  return {
    title: String(parsed.data.title ?? "Untitled"),
    slug: String(parsed.data.slug ?? fileName.replace(/\.md$/, "")),
    description: String(parsed.data.description ?? ""),
    body: parsed.content
  };
}
