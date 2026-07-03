import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

describe("@ilm/github-auth worker", () => {
  it("returns health status", async () => {
    const response = await worker.fetch(new Request("https://auth.ilm.dev/health"), {
      GITHUB_CLIENT_SECRET: "secret"
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await worker.fetch(new Request("https://auth.ilm.dev/missing"), {
      GITHUB_CLIENT_SECRET: "secret"
    });

    expect(response.status).toBe(404);
  });

  it("exchanges GitHub OAuth codes without exposing the client secret", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "token" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/oauth/token", {
        method: "POST",
        body: JSON.stringify({
          code: "code",
          client_id: "client",
          redirect_uri: "https://ilm.dev/callback",
          code_verifier: "verifier"
        })
      }),
      { GITHUB_CLIENT_SECRET: "secret" }
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({
        method: "POST"
      })
    );

    fetchMock.mockRestore();
  });
});
