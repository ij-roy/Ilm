import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getPublishedPosts, getSeoConfigPath } from "../src/template/posts";

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
      {
        title: "Live Post",
        slug: "live-post",
        description: "Published from the repository root.",
        body: "# Live\n",
        isDraft: false
      }
    ]);
  });

  it("resolves SEO config from the repository root", async () => {
    expect(getSeoConfigPath("D:/repo")).toBe("D:/repo/config/seo.ts");
  });
});
