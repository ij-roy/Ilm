import { describe, expect, it } from "vitest";
import {
  RepositoryLayout,
  buildDraftPath,
  buildMediaPath,
  buildPostPath,
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

    expect(markdown).toContain('title: "Hello Ilm"');
    expect(markdown).toContain('tags: ["cms", "github"]');
    expect(markdown).toContain("draft: true");
    expect(markdown).toContain("# Hello Ilm");
  });
});
