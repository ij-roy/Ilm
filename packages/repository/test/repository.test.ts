import { describe, expect, it } from "vitest";
import {
  ContentDocumentSchema,
  RepositoryLayout,
  SiteSettingsSchema,
  buildDraftPath,
  buildMediaPath,
  buildPostPath,
  createRepositoryKey,
  parseContentDocument,
  parseSiteSettings,
  serializeMarkdownDocument,
  validateRepositoryStructure
} from "../src/index";

describe("@ilm/repository", () => {
  it("builds canonical content and media paths", () => {
    expect(buildPostPath("Hello World!")).toBe("content/posts/hello-world.md");
    expect(buildDraftPath("My Draft")).toBe("content/drafts/my-draft.md");
    expect(buildMediaPath("cover", "../cover.png")).toEqual({
      kind: "cover",
      fileName: "cover.png",
      path: "media/covers/cover.png"
    });
  });

  it("validates the required external repository structure", () => {
    const entries = Object.values(RepositoryLayout).map((path) => ({
      path,
      type: path.endsWith(".ts") ? ("file" as const) : ("directory" as const)
    }));

    const result = validateRepositoryStructure(entries);

    expect(result.ok).toBe(true);
  });

  it("reports missing repository paths", () => {
    const result = validateRepositoryStructure([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
      expect(result.error.details?.missing).toContain("content/posts");
    }
  });

  it("serializes typed frontmatter into portable markdown", () => {
    const markdown = serializeMarkdownDocument({
      frontmatter: {
        title: "Hello Ilm",
        tags: ["cms", "github"],
        draft: true
      },
      body: "# Hello Ilm\n\nOwn your content."
    });

    expect(markdown).toContain("title: Hello Ilm");
    expect(markdown).toContain("tags:\n  - cms\n  - github");
    expect(markdown).toContain("draft: true");
    expect(markdown).toContain("# Hello Ilm");
  });

  it("parses a repository blog with its remote identity", () => {
    const document = parseContentDocument(
      "blog",
      "content/posts/hello-ilm.md",
      `---
title: "Hello Ilm"
description: "A complete repository-backed blog."
slug: "hello-ilm"
publishedAt: "2026-07-11T10:00:00.000Z"
updatedAt: "2026-07-11T10:00:00.000Z"
tags: ["ilm"]
categories: ["publishing"]
author: "IJ Roy"
---

# Hello
`,
      { blobSha: "blob-1", lastCommitSha: "commit-1" }
    );

    expect(document.path).toBe("content/posts/hello-ilm.md");
    expect(document.savedSlug).toBe("hello-ilm");
    expect(document.blobSha).toBe("blob-1");
    expect(document.markdown).toBe("# Hello\n");
    expect(ContentDocumentSchema.parse(document).kind).toBe("blog");
  });

  it("rejects a frontmatter slug that does not match its canonical file path", () => {
    expect(() =>
      parseContentDocument(
        "draft",
        "content/drafts/canonical-name.md",
        `---
title: "Draft"
slug: "different-name"
---

Draft body
`
      )
    ).toThrow(/slug.*file path/i);
  });

  it("parses v2 site settings and normalizes the blog path", () => {
    const settings = parseSiteSettings(
      JSON.stringify({
        schemaVersion: 2,
        title: "IJ Roy",
        description: "Notes on building software.",
        canonicalUrl: "https://ij-roy.github.io/",
        blogPath: "/journal/",
        author: { name: "IJ Roy" },
        theme: {
          accent: "#0f766e",
          background: "#ffffff",
          text: "#18181b",
          typography: "editorial"
        }
      })
    );

    expect(settings.blogPath).toBe("journal");
    expect(SiteSettingsSchema.parse(settings).schemaVersion).toBe(2);
    expect(createRepositoryKey({ owner: "IJ-Roy", repo: "Blog", branch: "Main" })).toBe(
      "ij-roy/blog/main"
    );
  });

  it("rejects unsafe site routes and colors", () => {
    expect(() =>
      parseSiteSettings(
        JSON.stringify({
          schemaVersion: 2,
          title: "Blog",
          description: "Description",
          canonicalUrl: "https://example.com",
          blogPath: "../admin",
          author: { name: "Author" },
          theme: {
            accent: "red",
            background: "#fff",
            text: "#000000",
            typography: "modern"
          }
        })
      )
    ).toThrow();
  });
});
