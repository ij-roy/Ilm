import { describe, expect, it } from "vitest";
import { createDraftSavePlan, createPublishPlan, validatePublishPlan } from "../src/index";

describe("@ilm/publishing", () => {
  it("creates draft-save commit manifests outside the repository package", () => {
    const result = createDraftSavePlan({
      slug: "My Draft",
      title: "My Draft",
      markdown: "# My Draft"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.draftPath).toBe("content/drafts/my-draft.md");
      expect(result.value.commit.files[0]?.path).toBe("content/drafts/my-draft.md");
      expect(result.value.commit.files[0]?.operation).toBe("upsert");
      expect(result.value.commit.message).toBe("draft: save My Draft");
    }
  });

  it("creates publish plans for published posts with draft cleanup and media writes", () => {
    const result = createPublishPlan({
      slug: "Ship Ilm",
      title: "Ship Ilm",
      markdown: "# Ship Ilm",
      draftSlug: "ship-ilm",
      hasRemoteDraft: true,
      media: [
        {
          location: { kind: "cover", fileName: "cover.webp", path: "media/covers/cover.webp" },
          content: "base64-cover",
          encoding: "base64"
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.postPath).toBe("content/posts/ship-ilm.md");
      expect(result.value.commit.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "content/posts/ship-ilm.md", operation: "upsert" }),
          expect.objectContaining({ path: "content/drafts/ship-ilm.md", operation: "delete" }),
          expect.objectContaining({ path: "media/covers/cover.webp", encoding: "base64" })
        ])
      );
      expect(validatePublishPlan(result.value).ok).toBe(true);
    }
  });
});
