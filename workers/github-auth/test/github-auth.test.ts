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
    const response = await worker.fetch(new Request("https://auth.ilm.dev/health", { method: "OPTIONS" }), {
      GITHUB_APP_ID: "12345",
      ALLOWED_ORIGIN: "http://localhost:5173"
    });

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

  it("returns 404 for removed installation-token endpoint", async () => {
    const env: Env = { GITHUB_APP_ID: "12345" };
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/installation-token", { method: "POST" }),
      env
    );
    expect(response.status).toBe(404);
  });

  it("redirects on callback route", async () => {
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
      new Request("https://auth.ilm.dev/github/app/callback?code=abc"),
      env
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("http://localhost:5173/dashboard?installation_id=9876&access_token=inst_token");
    
    vi.unstubAllGlobals();
  });
});
