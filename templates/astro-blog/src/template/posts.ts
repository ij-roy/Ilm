import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import matter from "gray-matter";
import { marked, Renderer } from "marked";

export type TemplatePost = {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly body: string;
  readonly isDraft?: boolean;
  readonly publishedAt: Date;
  readonly updatedAt: Date;
  readonly tags: string[];
  readonly categories: string[];
  readonly author: string;
  readonly coverImage?: string;
};

export type TemplateSiteSettings = {
  readonly schemaVersion: 2;
  readonly title: string;
  readonly description: string;
  readonly canonicalUrl: string;
  readonly blogPath: string;
  readonly author: { readonly name: string; readonly url?: string };
  readonly theme: {
    readonly logo?: string;
    readonly accent: string;
    readonly background: string;
    readonly text: string;
    readonly typography: "editorial" | "modern" | "technical";
  };
  readonly navigation: readonly { readonly label: string; readonly href: string }[];
  readonly googleAnalyticsId?: string;
};

const contentRoot = fileURLToPath(new URL("../content/posts", import.meta.url));
const draftRoot = fileURLToPath(new URL("../content/drafts", import.meta.url));

export function getSeoConfigPath(repoRoot: string = process.cwd()): string {
  return join(repoRoot, "config", "seo.ts").replace(/\\/g, "/");
}

export async function getSiteSettings(
  repoRoot: string = process.cwd()
): Promise<TemplateSiteSettings> {
  const raw = await readFile(join(repoRoot, "config", "site.json"), "utf-8");
  const value = JSON.parse(raw) as Partial<TemplateSiteSettings>;
  const blogPath = String(value.blogPath ?? "blog")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (
    value.schemaVersion !== 2 ||
    !value.title ||
    !value.description ||
    !value.canonicalUrl ||
    !value.author?.name ||
    !value.theme ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(blogPath) ||
    !/^#[0-9a-f]{6}$/i.test(value.theme.accent ?? "") ||
    !/^#[0-9a-f]{6}$/i.test(value.theme.background ?? "") ||
    !/^#[0-9a-f]{6}$/i.test(value.theme.text ?? "")
  ) {
    throw new Error("config/site.json is missing or invalid");
  }
  return { ...value, blogPath, navigation: value.navigation ?? [] } as TemplateSiteSettings;
}

export function getBlogUrl(
  settings: Pick<TemplateSiteSettings, "blogPath">,
  slug: string,
  base = "/"
): string {
  const normalizedBase = `/${base}`.replace(/\/{2,}/g, "/").replace(/\/?$/, "/");
  return `${normalizedBase}${settings.blogPath}/${slug}/`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(value: string): string | undefined {
  const compact = Array.from(value)
    .filter((character) => character.charCodeAt(0) > 32)
    .join("");
  if (/^(?:javascript|vbscript|data):/i.test(compact)) return undefined;
  return value;
}

export function renderSafeMarkdown(markdown: string): string {
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.link = function ({ href, title, tokens }) {
    const safe = safeHref(href);
    const text = this.parser.parseInline(tokens);
    if (!safe) return text;
    return `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${text}</a>`;
  };
  renderer.image = ({ href, title, text }) => {
    const safe = safeHref(href);
    if (!safe) return escapeHtml(text);
    return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ""}>`;
  };
  return String(marked.parse(markdown, { renderer }));
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
    isDraft,
    publishedAt: parseDate(parsed.data.publishedAt, `${fileName}: publishedAt`),
    updatedAt: parseDate(
      parsed.data.updatedAt ?? parsed.data.publishedAt,
      `${fileName}: updatedAt`
    ),
    tags: asStringArray(parsed.data.tags),
    categories: asStringArray(parsed.data.categories),
    author: String(parsed.data.author ?? ""),
    coverImage: parsed.data.coverImage ? String(parsed.data.coverImage) : undefined
  };
}

function parseDate(value: unknown, label: string): Date {
  if (!value) return new Date(0);
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid`);
  return date;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
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
