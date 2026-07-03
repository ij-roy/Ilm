import { describe, expect, it } from "vitest";
import { createCredentialPolicy, createSuggestion } from "../src/index";

describe("@ilm/ai", () => {
  it("defaults credentials to session-only use", () => {
    expect(createCredentialPolicy("openai")).toEqual({
      provider: "openai",
      mode: "session",
      encrypted: false
    });
  });

  it("marks all suggestions as requiring approval", () => {
    const suggestion = createSuggestion(
      { kind: "summarize", selectedText: "hello", contextMarkdown: "# Hello" },
      "Summary"
    );

    expect(suggestion.requiresApproval).toBe(true);
  });
});
