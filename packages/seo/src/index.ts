export type SeoInput = {
  readonly title: string;
  readonly description: string;
  readonly canonicalBaseUrl: string;
  readonly slug?: string;
  readonly coverImage?: string;
};

export type SeoMetadata = {
  readonly slug: string;
  readonly canonicalUrl: string;
  readonly openGraph: Record<string, string>;
  readonly twitter: Record<string, string>;
  readonly jsonLd: Record<string, unknown>;
};

export function generateSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateSeoMetadata(input: SeoInput): SeoMetadata {
  const slug = input.slug ?? generateSlug(input.title);
  const canonicalUrl = `${input.canonicalBaseUrl.replace(/\/$/, "")}/${slug}/`;

  return {
    slug,
    canonicalUrl,
    openGraph: {
      "og:title": input.title,
      "og:description": input.description,
      "og:url": canonicalUrl,
      ...(input.coverImage ? { "og:image": input.coverImage } : {})
    },
    twitter: {
      "twitter:card": input.coverImage ? "summary_large_image" : "summary",
      "twitter:title": input.title,
      "twitter:description": input.description
    },
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: input.title,
      description: input.description,
      url: canonicalUrl
    }
  };
}

export function scoreSeo(input: SeoInput): number {
  let score = 0;
  if (input.title.length >= 20 && input.title.length <= 70) score += 30;
  if (input.description.length >= 80 && input.description.length <= 160) score += 30;
  if (input.canonicalBaseUrl.startsWith("https://")) score += 20;
  if (input.coverImage) score += 20;
  return score;
}
