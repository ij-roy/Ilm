import { describe, expect, it, vi } from "vitest";
import { createCredentialPolicy, createSuggestion, generateGeminiSuggestion } from "../src/index";

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

  it("successfully calls Gemini API and returns suggestions", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "This is a polished sentence."
                }
              ]
            }
          }
        ]
      })
    });
    vi.stubGlobal("fetch", mockFetch);

    const suggestion = await generateGeminiSuggestion(
      { kind: "improve-writing", selectedText: "broken text", contextMarkdown: "some context" },
      "dummy-api-key"
    );

    expect(suggestion.kind).toBe("improve-writing");
    expect(suggestion.content).toBe("This is a polished sentence.");
    expect(suggestion.requiresApproval).toBe(true);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=dummy-api-key"),
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  it("throws error when API key is missing", async () => {
    await expect(
      generateGeminiSuggestion(
        { kind: "summarize", selectedText: "", contextMarkdown: "" },
        ""
      )
    ).rejects.toThrow("Gemini API key is required");
  });
});
