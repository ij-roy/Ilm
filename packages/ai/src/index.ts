export type AiProvider = "openai" | "anthropic" | "gemini";

export type AiCredentialMode = "session" | "encrypted-local";

export type AiCredentialPolicy = {
  readonly provider: AiProvider;
  readonly mode: AiCredentialMode;
  readonly encrypted: boolean;
};

export type AiSuggestionKind =
  | "improve-writing"
  | "fix-grammar"
  | "rewrite"
  | "summarize"
  | "tags"
  | "categories"
  | "internal-links"
  | "social-post";

export type AiSuggestionRequest = {
  readonly kind: AiSuggestionKind;
  readonly selectedText: string;
  readonly contextMarkdown: string;
};

export type AiSuggestion = {
  readonly kind: AiSuggestionKind;
  readonly content: string;
  readonly requiresApproval: true;
};

export function createCredentialPolicy(
  provider: AiProvider,
  mode: AiCredentialMode = "session"
): AiCredentialPolicy {
  return {
    provider,
    mode,
    encrypted: mode === "encrypted-local"
  };
}

export function createSuggestion(request: AiSuggestionRequest, content: string): AiSuggestion {
  return {
    kind: request.kind,
    content,
    requiresApproval: true
  };
}
