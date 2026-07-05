import { describe, expect, it } from "vitest";
import { generateSeoMetadata, generateSlug, scoreSeo } from "../src/index";

describe("@ilm/seo", () => {
  it("generates slugs and canonical metadata", () => {
    expect(generateSlug("Hello, Ilm World!")).toBe("hello-ilm-world");

    const metadata = generateSeoMetadata({
      title: "A practical guide to shipping Ilm",
      description: "A detailed technical article about shipping Ilm with strong SEO foundations.",
      canonicalBaseUrl: "https://example.com",
      coverImage: "/media/covers/ilm.webp"
    });

    expect(metadata.slug).toBe("a-practical-guide-to-shipping-ilm");
    expect(metadata.canonicalUrl).toContain("https://example.com/");
    expect(metadata.openGraph["og:site_name"]).toBe("Ilm");
    expect(metadata.openGraph["og:image"]).toBe("https://example.com/media/covers/ilm.webp");
    expect(metadata.twitter["twitter:image"]).toBe("https://example.com/media/covers/ilm.webp");
  });

  it("scores complete SEO inputs higher than incomplete inputs", () => {
    expect(
      scoreSeo({
        title: "A practical guide to shipping Ilm",
        description:
          "This article explains how Ilm turns a GitHub repository into a fast, searchable, static technical blog.",
        canonicalBaseUrl: "https://example.com",
        coverImage: "/media/covers/ilm.webp"
      })
    ).toBeGreaterThan(70);
  });
});
