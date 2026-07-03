import { describe, expect, it } from "vitest";
import { createGoogleOAuthUrl } from "../src/index";

describe("@ilm/analytics", () => {
  it("builds Google OAuth URLs without API keys", () => {
    const url = createGoogleOAuthUrl({
      clientId: "client",
      redirectUri: "https://ilm.example/auth/google",
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      state: "state"
    });

    expect(url).toContain("accounts.google.com");
    expect(url).toContain("webmasters.readonly");
  });
});
