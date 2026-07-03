import { describe, expect, it } from "vitest";
import {
  countWords,
  estimateReadingTimeMinutes,
  extractOutline,
  isLocalDraftNewer
} from "../src/index";

describe("@ilm/editor", () => {
  it("extracts authoring metadata from Markdown", () => {
    const markdown = "# Title\n\nSome body text here.\n\n## Section\n\nMore words.";

    expect(countWords(markdown)).toBe(8);
    expect(estimateReadingTimeMinutes(markdown)).toBe(1);
    expect(extractOutline(markdown)).toEqual([
      { level: 1, title: "Title", anchor: "title" },
      { level: 2, title: "Section", anchor: "section" }
    ]);
  });

  it("detects newer local draft recovery snapshots", () => {
    expect(
      isLocalDraftNewer(
        {
          repositoryId: "owner/repo",
          draftPath: "content/drafts/a.md",
          markdown: "# A",
          updatedAt: "2026-07-03T10:00:00.000Z"
        },
        "2026-07-03T09:00:00.000Z"
      )
    ).toBe(true);
  });
});
