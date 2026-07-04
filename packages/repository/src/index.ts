import { z } from "zod";
import { AppError, Result, err, ok, validationError } from "@ilm/shared";

export const RepositoryLayout = {
  content: "content",
  posts: "content/posts",
  drafts: "content/drafts",
  media: "media",
  images: "media/images",
  covers: "media/covers",
  attachments: "media/attachments",
  config: "config",
  siteConfig: "config/site.ts",
  seoConfig: "config/seo.ts",
  navigationConfig: "config/navigation.ts",
  astroSite: "site/astro",
  workflows: ".github/workflows"
} as const;

export type RepositoryLayoutKey = keyof typeof RepositoryLayout;

export const PostFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  publishedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tags: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  series: z.string().optional(),
  author: z.string().min(1),
  coverImage: z.string().optional(),
  coverAlt: z.string().optional()
});

export const DraftFrontmatterSchema = PostFrontmatterSchema.partial({
  description: true,
  slug: true,
  publishedAt: true,
  updatedAt: true,
  author: true
}).extend({
  title: z.string().min(1)
});

export const SiteConfigSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
  locale: z.string().default("en"),
  author: z.object({
    name: z.string().min(1),
    url: z.string().url().optional()
  })
});

export const SeoConfigSchema = z.object({
  defaultTitle: z.string().min(1),
  defaultDescription: z.string().min(1),
  canonicalBaseUrl: z.string().url(),
  robots: z.enum(["index,follow", "noindex,nofollow"]).default("index,follow"),
  googleAnalyticsId: z.string().optional()
});

export const NavigationConfigSchema = z.object({
  header: z.array(z.object({ label: z.string().min(1), href: z.string().min(1) })).default([]),
  footer: z.array(z.object({ label: z.string().min(1), href: z.string().min(1) })).default([])
});

export type PostFrontmatter = z.infer<typeof PostFrontmatterSchema>;
export type DraftFrontmatter = z.infer<typeof DraftFrontmatterSchema>;
export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type SeoConfig = z.infer<typeof SeoConfigSchema>;
export type NavigationConfig = z.infer<typeof NavigationConfigSchema>;

export type Post = {
  readonly path: string;
  readonly frontmatter: PostFrontmatter;
  readonly markdown: string;
};

export type Draft = {
  readonly path: string;
  readonly frontmatter: DraftFrontmatter;
  readonly markdown: string;
};

export type MarkdownDocument<TFrontmatter extends Record<string, unknown>> = {
  readonly frontmatter: TFrontmatter;
  readonly body: string;
};

export type MediaKind = "image" | "cover" | "attachment";

export type MediaLocation = {
  readonly kind: MediaKind;
  readonly path: string;
  readonly fileName: string;
};

export type RepositoryEntry = {
  readonly path: string;
  readonly type: "file" | "directory";
};

export type RepositoryValidation = {
  readonly valid: boolean;
  readonly missing: string[];
};

export function sanitizePathSegment(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildPostPath(slug: string): string {
  return `${RepositoryLayout.posts}/${sanitizePathSegment(slug)}.md`;
}

export function buildDraftPath(slug: string): string {
  return `${RepositoryLayout.drafts}/${sanitizePathSegment(slug)}.md`;
}

export function buildMediaPath(kind: MediaKind, fileName: string): MediaLocation {
  const cleanFileName = fileName
    .split(/[/\\]+/)
    .filter((segment) => segment !== "." && segment !== ".." && segment.trim().length > 0)
    .at(-1)
    ?.trim();
  if (!cleanFileName) {
    throw new Error("Media file name is required");
  }
  const root =
    kind === "image"
      ? RepositoryLayout.images
      : kind === "cover"
        ? RepositoryLayout.covers
        : RepositoryLayout.attachments;

  return {
    kind,
    fileName: cleanFileName,
    path: `${root}/${cleanFileName}`
  };
}

export function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`);
  return `---\n${lines.join("\n")}\n---`;
}

export function serializeMarkdownDocument<TFrontmatter extends Record<string, unknown>>(
  document: MarkdownDocument<TFrontmatter>
): string {
  return `${serializeFrontmatter(document.frontmatter)}\n\n${document.body.trim()}\n`;
}

function formatYamlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(String(item))).join(", ")}]`;
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function validateRepositoryStructure(
  entries: readonly RepositoryEntry[]
): Result<RepositoryValidation, AppError> {
  const present = new Set(entries.map((entry) => entry.path.replace(/\\/g, "/")));
  const required = [
    RepositoryLayout.posts,
    RepositoryLayout.drafts,
    RepositoryLayout.images,
    RepositoryLayout.covers,
    RepositoryLayout.attachments,
    RepositoryLayout.config,
    RepositoryLayout.siteConfig,
    RepositoryLayout.seoConfig,
    RepositoryLayout.navigationConfig,
    RepositoryLayout.astroSite,
    RepositoryLayout.workflows
  ];
  const missing = required.filter((path) => !present.has(path));

  if (missing.length > 0) {
    return err(validationError("Repository is missing required Ilm paths", { missing }));
  }

  return ok({ valid: true, missing: [] });
}
