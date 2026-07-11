import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getBlogUrl,
  getPublishedPosts,
  getSeoConfigPath,
  getSiteSettings,
  renderSafeMarkdown
} from "../src/template/posts";

describe("@ilm/astro-blog-template", () => {
  it("reads published posts from the template content directory", async () => {
    const posts = await getPublishedPosts();

    expect(posts[0]?.slug).toBe("welcome-to-ilm");
  });

  it("reads published posts from top-level repository content", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "ilm-template-"));
    await mkdir(join(repoRoot, "content", "posts"), { recursive: true });
    await writeFile(
      join(repoRoot, "content", "posts", "live-post.md"),
      `---
title: "Live Post"
slug: "live-post"
description: "Published from the repository root."
---

# Live
`
    );

    const posts = await getPublishedPosts(repoRoot);

    expect(posts).toEqual([
      expect.objectContaining({
        title: "Live Post",
        slug: "live-post",
        description: "Published from the repository root.",
        body: "# Live\n",
        isDraft: false
      })
    ]);
  });

  it("resolves SEO config from the repository root", async () => {
    expect(getSeoConfigPath("D:/repo")).toBe("D:/repo/config/seo.ts");
  });

  it("loads validated site settings with a configurable blog path", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "ilm-settings-"));
    await mkdir(join(repoRoot, "config"), { recursive: true });
    await writeFile(
      join(repoRoot, "config", "site.json"),
      JSON.stringify({
        schemaVersion: 2,
        title: "Human Notes",
        description: "Carefully written ideas.",
        canonicalUrl: "https://owner.github.io/repo/",
        blogPath: "journal",
        author: { name: "Writer" },
        theme: {
          accent: "#0f766e",
          background: "#ffffff",
          text: "#18181b",
          typography: "editorial"
        },
        navigation: []
      })
    );

    const settings = await getSiteSettings(repoRoot);
    expect(settings.blogPath).toBe("journal");
    expect(getBlogUrl(settings, "hello-world", "/repo/")).toBe("/repo/journal/hello-world/");
  });

  it("removes executable HTML and unsafe URL protocols from markdown", () => {
    const html = renderSafeMarkdown(
      `Hello <script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)>`
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("Hello");
  });

  it("preserves frontmatter publication dates", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "ilm-dates-"));
    await mkdir(join(repoRoot, "content", "posts"), { recursive: true });
    await writeFile(
      join(repoRoot, "content", "posts", "dated.md"),
      `---
title: "Dated"
slug: "dated"
description: "A dated blog."
publishedAt: "2025-01-02T03:04:05.000Z"
updatedAt: "2025-02-03T04:05:06.000Z"
tags: ["history"]
categories: ["notes"]
author: "Writer"
---

Body
`
    );

    const [post] = await getPublishedPosts(repoRoot);
    expect(post?.publishedAt.toISOString()).toBe("2025-01-02T03:04:05.000Z");
    expect(post?.updatedAt.toISOString()).toBe("2025-02-03T04:05:06.000Z");
  });
});
