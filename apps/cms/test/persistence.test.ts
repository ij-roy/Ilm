import { describe, expect, it } from "vitest";
import {
  createOAuthState,
  migrateLegacyCmsState,
  parseOAuthState,
  sanitizeStateForStorage
} from "../src/lib/persistence";

describe("CMS trust persistence", () => {
  it("round-trips an OAuth nonce and initiating origin", () => {
    const encoded = createOAuthState("nonce-123", "https://ilm.dophera.tech");

    expect(parseOAuthState(encoded)).toEqual({
      nonce: "nonce-123",
      origin: "https://ilm.dophera.tech"
    });
  });

  it("removes every plaintext credential before local persistence", () => {
    const safe = sanitizeStateForStorage({
      geminiApiKey: "plain-gemini",
      userToken: "github-user",
      accessToken: "github-installation",
      geminiEncryptedKey: "ciphertext",
      activeDraft: { title: "Safe draft" }
    });

    expect(JSON.stringify(safe)).not.toContain("plain-gemini");
    expect(JSON.stringify(safe)).not.toContain("github-user");
    expect(JSON.stringify(safe)).not.toContain("github-installation");
    expect(safe).toMatchObject({
      geminiEncryptedKey: "ciphertext",
      activeDraft: { title: "Safe draft" }
    });
  });

  it("partitions legacy content under its repository key", () => {
    const migrated = migrateLegacyCmsState({
      repository: { owner: "IJ-Roy", repo: "Blog", branch: "main", fullName: "IJ-Roy/Blog" },
      activeDraft: { id: "draft-local", title: "Recovered" },
      drafts: [{ id: "one", title: "Draft" }],
      posts: [{ id: "two", title: "Blog" }],
      media: [],
      events: [],
      geminiApiKey: "must-disappear",
      geminiEncryptedKey: "ciphertext"
    });

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.selectedRepositoryKey).toBe("ij-roy/blog/main");
    expect(migrated.workspaces["ij-roy/blog/main"]).toMatchObject({
      activeDraft: { title: "Recovered" },
      drafts: [{ title: "Draft" }],
      posts: [{ title: "Blog" }]
    });
    expect(JSON.stringify(migrated)).not.toContain("must-disappear");
  });
});
