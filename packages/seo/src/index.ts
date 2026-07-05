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
  const absoluteImageUrl = input.coverImage
    ? new URL(input.coverImage, input.canonicalBaseUrl).toString()
    : undefined;

  return {
    slug,
    canonicalUrl,
    openGraph: {
      "og:title": input.title,
      "og:description": input.description,
      "og:type": "article",
      "og:site_name": "Ilm",
      "og:url": canonicalUrl,
      ...(absoluteImageUrl
        ? {
            "og:image": absoluteImageUrl,
            "og:image:alt": input.title
          }
        : {})
    },
    twitter: {
      "twitter:card": absoluteImageUrl ? "summary_large_image" : "summary",
      "twitter:title": input.title,
      "twitter:description": input.description,
      ...(absoluteImageUrl ? { "twitter:image": absoluteImageUrl } : {})
    },
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: input.title,
      description: input.description,
      url: canonicalUrl,
      ...(absoluteImageUrl ? { image: [absoluteImageUrl] } : {})
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
