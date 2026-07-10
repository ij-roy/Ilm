import { beforeAll, describe, expect, it, vi } from "vitest";
import worker, { Env } from "../src/index";

describe("@ilm/github-auth worker", () => {
  let mockPrivateKeyPem = "";

  beforeAll(async () => {
    // Generate a valid RSA key pair to test real JWT signing logic in vitest
    const keys = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["sign", "verify"]
    );
    const privateKeyDer = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(privateKeyDer)));
    mockPrivateKeyPem = `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
  });

  it("returns health status", async () => {
    const response = await worker.fetch(new Request("https://auth.ilm.dev/health"), {
      GITHUB_APP_ID: "12345"
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await worker.fetch(new Request("https://auth.ilm.dev/missing"), {
      GITHUB_APP_ID: "12345"
    });

    expect(response.status).toBe(404);
  });

  it("handles OPTIONS request with CORS headers", async () => {
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/health", { method: "OPTIONS" }),
      {
        GITHUB_APP_ID: "12345",
        ALLOWED_ORIGIN: "http://localhost:5173"
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
  });

  it("returns app metadata using real JWT generation", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        client_id: "test-client-id",
        name: "Ilm CMS App",
        html_url: "https://github.com/apps/ilm-cms-app"
      })
    });
    vi.stubGlobal("fetch", mockFetch);

    const env: Env = {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: mockPrivateKeyPem,
      ALLOWED_ORIGIN: "http://localhost:5173"
    };

    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/metadata"),
      env
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      appId: "12345",
      clientId: "test-client-id",
      name: "Ilm CMS App",
      htmlUrl: "https://github.com/apps/ilm-cms-app"
    });

    expect(mockFetch).toHaveBeenCalledWith("https://api.github.com/app", expect.any(Object));
    vi.unstubAllGlobals();
  });

  it("returns 401 if installation-token endpoint is called without token", async () => {
    const env: Env = { GITHUB_APP_ID: "12345" };
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/installation-token", { method: "POST" }),
      env
    );
    expect(response.status).toBe(401);
  });

  it("redirects on callback route and preserves state", async () => {
    const env: Env = {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: mockPrivateKeyPem,
      GITHUB_CLIENT_SECRET: "mock_secret",
      ALLOWED_ORIGIN: "http://localhost:5173"
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/app") && !url.includes("installations")) {
        return Promise.resolve(new Response(JSON.stringify({ client_id: "cid", html_url: "url" })));
      }
      if (url.includes("oauth/access_token")) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: "user_token" })));
      }
      if (url.includes("user/installations")) {
        return Promise.resolve(new Response(JSON.stringify({ installations: [{ id: 9876 }] })));
      }
      if (url.includes("access_tokens")) {
        return Promise.resolve(new Response(JSON.stringify({ token: "inst_token" })));
      }
      return Promise.resolve(new Response("{}"));
    });
    vi.stubGlobal("fetch", mockFetch);

    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/callback?code=abc&state=nonce-123"),
      env
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location") ?? "");
    const hashParams = new URLSearchParams(location.hash.slice(1));
    expect(`${location.origin}${location.pathname}`).toBe("http://localhost:5173/dashboard");
    expect(hashParams.get("user_token")).toBe("user_token");
    expect(hashParams.get("state")).toBe("nonce-123");

    vi.unstubAllGlobals();
  });

  it("preserves OAuth cancellation errors in callback redirects", async () => {
    const env: Env = {
      GITHUB_APP_ID: "12345",
      ALLOWED_ORIGIN: "http://localhost:5173"
    };

    const response = await worker.fetch(
      new Request(
        "https://auth.ilm.dev/github/app/callback?error=access_denied&error_description=The+user+cancelled&state=nonce-123"
      ),
      env
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:5173/dashboard#error=access_denied&error_description=The+user+cancelled&state=nonce-123"
    );
  });

  it("returns installation token expiry", async () => {
    const env: Env = {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: mockPrivateKeyPem,
      ALLOWED_ORIGIN: "http://localhost:5173"
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("user/installations")) {
        return Promise.resolve(new Response(JSON.stringify({ installations: [{ id: 9876 }] })));
      }
      if (url.includes("access_tokens")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              token: "inst_token",
              expires_at: "2026-07-08T10:00:00Z"
            })
          )
        );
      }
      return Promise.resolve(new Response("{}"));
    });
    vi.stubGlobal("fetch", mockFetch);

    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/installation-token", {
        method: "POST",
        headers: { Authorization: "Bearer user_token" },
        body: JSON.stringify({ installationId: 9876 })
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      token: "inst_token",
      expiresAt: "2026-07-08T10:00:00Z"
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/app/installations/9876/access_tokens",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          permissions: {
            contents: "write",
            actions: "read",
            metadata: "read"
          }
        })
      })
    );

    vi.unstubAllGlobals();
  });

  it("rejects installation token requests for inaccessible installations", async () => {
    const env: Env = {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: mockPrivateKeyPem,
      ALLOWED_ORIGIN: "http://localhost:5173"
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ installations: [{ id: 1111 }] }), { status: 200 })
        )
    );

    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/installation-token", {
        method: "POST",
        headers: { Authorization: "Bearer user_token" },
        body: JSON.stringify({ installationId: 9876 })
      }),
      env
    );

    expect(response.status).toBe(403);
    vi.unstubAllGlobals();
  });

  it("returns actionable details when GitHub rejects installation token permissions", async () => {
    const env: Env = {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: mockPrivateKeyPem,
      ALLOWED_ORIGIN: "http://localhost:5173"
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("user/installations")) {
          return Promise.resolve(
            new Response(JSON.stringify({ installations: [{ id: 9876 }] }), { status: 200 })
          );
        }
        if (url.includes("access_tokens")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                message: "Validation Failed",
                errors: [{ message: "The permissions requested are not granted to this app" }]
              }),
              { status: 422 }
            )
          );
        }
        return Promise.resolve(new Response("{}"));
      })
    );

    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/installation-token", {
        method: "POST",
        headers: { Authorization: "Bearer user_token" },
        body: JSON.stringify({ installationId: 9876 })
      }),
      env
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "GitHub App permissions are not approved for this installation",
      details:
        "Validation Failed: The permissions requested are not granted to this app",
      requiredPermissions: ["Contents: write", "Actions: read"]
    });
    vi.unstubAllGlobals();
  });

  it("requests elevated Pages permissions only for setup tokens", async () => {
    const env: Env = {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: mockPrivateKeyPem,
      ALLOWED_ORIGIN: "http://localhost:5173"
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("user/installations")) {
        return Promise.resolve(new Response(JSON.stringify({ installations: [{ id: 9876 }] })));
      }
      if (url.includes("access_tokens")) {
        return Promise.resolve(new Response(JSON.stringify({ token: "setup_token" })));
      }
      return Promise.resolve(new Response("{}"));
    });
    vi.stubGlobal("fetch", mockFetch);

    await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/installation-token", {
        method: "POST",
        headers: { Authorization: "Bearer user_token" },
        body: JSON.stringify({ installationId: 9876, purpose: "pages-setup" })
      }),
      env
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/app/installations/9876/access_tokens",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          permissions: {
            contents: "write",
            actions: "read",
            workflows: "write",
            pages: "write",
            administration: "write",
            metadata: "read"
          }
        })
      })
    );
    vi.unstubAllGlobals();
  });

  it("verifies reachable GitHub Pages live URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 }))
    );

    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/live-url/verify", {
        method: "POST",
        body: JSON.stringify({ url: "https://owner.github.io/repo/posts/live-post/" })
      }),
      { GITHUB_APP_ID: "12345", ALLOWED_ORIGIN: "http://localhost:5173" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reachable: true,
      status: 200,
      url: "https://owner.github.io/repo/posts/live-post/"
    });
    vi.unstubAllGlobals();
  });

  it("rejects unsafe live URL verification targets", async () => {
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/live-url/verify", {
        method: "POST",
        body: JSON.stringify({ url: "http://localhost:5173/posts/live-post/" })
      }),
      { GITHUB_APP_ID: "12345", ALLOWED_ORIGIN: "http://localhost:5173" }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Only HTTPS GitHub Pages URLs can be verified"
    });
  });
});
