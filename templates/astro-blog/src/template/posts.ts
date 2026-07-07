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

export function getSeoConfigPath(repoRoot: string = process.cwd()): string {
  return join(repoRoot, "config", "seo.ts").replace(/\\/g, "/");
}

export async function getPublishedPosts(repoRoot: string = process.cwd()): Promise<TemplatePost[]> {
  const repositoryContentRoot = join(repoRoot, "content", "posts");
  try {
    const files = (await readdir(repositoryContentRoot)).filter((file) => file.endsWith(".md"));
    return Promise.all(files.map((file) => readPost(file, false, repoRoot)));
  } catch {
    try {
      const files = (await readdir(contentRoot)).filter((file) => file.endsWith(".md"));
      return Promise.all(files.map((file) => readPost(file)));
    } catch {
      return [];
    }
  }
}

async function readPost(
  fileName: string,
  isDraft: boolean = false,
  repoRoot?: string
): Promise<TemplatePost> {
  const root = repoRoot
    ? join(repoRoot, isDraft ? "content/drafts" : "content/posts")
    : isDraft
      ? draftRoot
      : contentRoot;
  const raw = await readFile(join(root, fileName), "utf-8");
  const parsed = matter(raw);
  return {
    title: String(parsed.data.title ?? "Untitled"),
    slug: String(parsed.data.slug ?? fileName.replace(/\.md$/, "")),
    description: String(parsed.data.description ?? ""),
    body: parsed.content.trimStart(),
    isDraft
  };
}

export async function getSearchableContent(isDev: boolean): Promise<TemplatePost[]> {
  const repoRoot = process.cwd();
  const posts = await getPublishedPosts(repoRoot);
  let drafts: TemplatePost[] = [];

  if (isDev) {
    try {
      const files = (await readdir(join(repoRoot, "content", "drafts"))).filter((file) =>
        file.endsWith(".md")
      );
      drafts = await Promise.all(files.map((file) => readPost(file, true, repoRoot)));
    } catch {
      try {
        const files = (await readdir(draftRoot)).filter((file) => file.endsWith(".md"));
        drafts = await Promise.all(files.map((file) => readPost(file, true)));
      } catch {
        // no drafts directory
      }
    }
  }

  return [...posts, ...drafts];
}
