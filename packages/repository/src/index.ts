import { z } from "zod";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
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

const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color");

export const SiteSettingsSchema = z.object({
  schemaVersion: z.literal(2),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  canonicalUrl: z.string().url(),
  blogPath: z
    .string()
    .transform((value) => value.trim().replace(/^\/+|\/+$/g, ""))
    .pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Blog path must be one safe segment")),
  author: z.object({
    name: z.string().trim().min(1),
    url: z.string().url().optional()
  }),
  theme: z.object({
    logo: z.string().optional(),
    accent: HexColorSchema,
    background: HexColorSchema,
    text: HexColorSchema,
    typography: z.enum(["editorial", "modern", "technical"])
  }),
  navigation: z
    .array(z.object({ label: z.string().trim().min(1), href: z.string().trim().min(1) }))
    .default([]),
  googleAnalyticsId: z.string().trim().optional()
});

export type SiteSettings = z.infer<typeof SiteSettingsSchema>;

export const ContentDocumentSchema = z.object({
  kind: z.enum(["draft", "blog"]),
  path: z.string().min(1),
  blobSha: z.string().optional(),
  lastCommitSha: z.string().optional(),
  savedSlug: z.string().min(1),
  frontmatter: z.union([PostFrontmatterSchema, DraftFrontmatterSchema]),
  markdown: z.string()
});

export type ContentDocument = z.infer<typeof ContentDocumentSchema>;

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

export function createRepositoryKey(ref: {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
}): string {
  return `${ref.owner}/${ref.repo}/${ref.branch}`.toLowerCase();
}

export function parseSiteSettings(content: string): SiteSettings {
  return SiteSettingsSchema.parse(JSON.parse(content));
}

export function parseContentDocument(
  kind: "draft" | "blog",
  path: string,
  content: string,
  identity: { readonly blobSha?: string; readonly lastCommitSha?: string } = {}
): ContentDocument {
  const boundary = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!boundary) throw new Error("Markdown document is missing valid frontmatter");
  const data = parseYaml(boundary[1], { maxAliasCount: 0 }) as unknown;
  const markdown = content.slice(boundary[0].length);
  const fileSlug = path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "";
  const schema = kind === "blog" ? PostFrontmatterSchema : DraftFrontmatterSchema;
  const frontmatter = schema.parse(data);
  const declaredSlug = frontmatter.slug;

  if (declaredSlug && declaredSlug !== fileSlug) {
    throw new Error(`Frontmatter slug must match the file path slug (${fileSlug})`);
  }

  return ContentDocumentSchema.parse({
    kind,
    path,
    ...identity,
    savedSlug: fileSlug,
    frontmatter: { ...frontmatter, slug: declaredSlug ?? fileSlug },
    markdown: markdown.trimStart()
  });
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
  const value = Object.fromEntries(
    Object.entries(frontmatter).filter(([, item]) => item !== undefined && item !== "")
  );
  return `---\n${stringifyYaml(value, { lineWidth: 0 }).trimEnd()}\n---`;
}

export function serializeMarkdownDocument<TFrontmatter extends Record<string, unknown>>(
  document: MarkdownDocument<TFrontmatter>
): string {
  return `${serializeFrontmatter(document.frontmatter)}\n\n${document.body.trim()}\n`;
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
    RepositoryLayout.workflows
  ];
  const missing = required.filter((path) => !present.has(path));

  if (missing.length > 0) {
    return err(validationError("Repository is missing required Ilm paths", { missing }));
  }

  return ok({ valid: true, missing: [] });
}
