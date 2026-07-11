import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

  afterEach(() => vi.unstubAllGlobals());

  const encodeState = (nonce: string, origin: string) =>
    btoa(JSON.stringify({ nonce, origin }))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const productionEnv = (): Env => ({
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY: mockPrivateKeyPem,
    GITHUB_CLIENT_SECRET: "mock_secret",
    ALLOWED_ORIGIN: "http://localhost:5173,https://cms.ilm.dev,https://preview.ilm.dev"
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
      apiVersion: 2,
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
      ALLOWED_ORIGIN: "http://localhost:5173,https://cms.ilm.dev"
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

    const state = encodeState("nonce-123", "https://cms.ilm.dev");
    const response = await worker.fetch(
      new Request(`https://auth.ilm.dev/github/app/callback?code=abc&state=${state}`),
      env
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location") ?? "");
    const hashParams = new URLSearchParams(location.hash.slice(1));
    expect(`${location.origin}${location.pathname}`).toBe("https://cms.ilm.dev/dashboard");
    expect(hashParams.get("user_token")).toBe("user_token");
    expect(hashParams.get("state")).toBe(state);

    vi.unstubAllGlobals();
  });

  it("preserves OAuth cancellation errors in callback redirects", async () => {
    const env: Env = {
      GITHUB_APP_ID: "12345",
      ALLOWED_ORIGIN: "http://localhost:5173,https://cms.ilm.dev"
    };

    const state = encodeState("nonce-123", "https://cms.ilm.dev");

    const response = await worker.fetch(
      new Request(
        `https://auth.ilm.dev/github/app/callback?error=access_denied&error_description=The+user+cancelled&state=${state}`
      ),
      env
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `https://cms.ilm.dev/dashboard#error=access_denied&error_description=The+user+cancelled&state=${state}`
    );
  });

  it("uses the first HTTPS allowed origin when callback state is invalid", async () => {
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/callback?code=abc&state=not-json"),
      productionEnv()
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://cms.ilm.dev/dashboard#error=invalid_state"
    );
  });

  it("rejects callback state containing a disallowed origin", async () => {
    const state = encodeState("nonce", "https://evil.example");
    const response = await worker.fetch(
      new Request(`https://auth.ilm.dev/github/app/callback?code=abc&state=${state}`),
      productionEnv()
    );
    expect(response.headers.get("Location")).toBe(
      "https://cms.ilm.dev/dashboard#error=invalid_state"
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
      details: "Validation Failed: The permissions requested are not granted to this app",
      requiredPermissions: ["Contents: write", "Actions: read"]
    });
    vi.unstubAllGlobals();
  });

  it("rejects public requests for elevated setup tokens", async () => {
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

    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/installation-token", {
        method: "POST",
        headers: { Authorization: "Bearer user_token" },
        body: JSON.stringify({ installationId: 9876, purpose: "pages-setup" })
      }),
      env
    );

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("plans a managed setup using paginated ownership and repository checks", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.includes("/user/installations?per_page=100&page=1"))
          return new Response(JSON.stringify({ installations: [], total_count: 101 }));
        if (url.includes("/user/installations?per_page=100&page=2"))
          return new Response(JSON.stringify({ installations: [{ id: 9876 }] }));
        if (url.includes("/access_tokens"))
          return new Response(JSON.stringify({ token: "elevated-secret" }));
        if (url.includes("/installation/repositories?per_page=100&page=1"))
          return new Response(JSON.stringify({ repositories: [{ full_name: "owner/repo" }] }));
        if (url.endsWith("/repos/owner/repo"))
          return new Response(JSON.stringify({ default_branch: "main" }));
        if (url.includes("/git/ref/heads/main"))
          return new Response(JSON.stringify({ object: { sha: "head-1" } }));
        if (url.includes("/pages")) return new Response(JSON.stringify({ build_type: "legacy" }));
        if (url.includes("/contents/")) return new Response("Not Found", { status: 404 });
        return new Response("unexpected " + url, { status: 500 });
      })
    );

    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/site-setup/plan", {
        method: "POST",
        headers: { Authorization: "Bearer user-token" },
        body: JSON.stringify({ installationId: 9876, owner: "owner", repo: "repo" })
      }),
      productionEnv()
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      headSha: "head-1",
      templateVersion: "2",
      updates: [],
      conflicts: [],
      unchanged: [],
      pagesStatus: "legacy"
    });
    expect(payload.additions).toEqual(
      expect.arrayContaining([".github/workflows/ilm-pages.yml", ".ilm/site-manifest.json"])
    );
    expect(JSON.stringify(payload)).not.toContain("elevated-secret");
    expect(requests.some(({ url }) => url.includes("page=2"))).toBe(true);
  });

  it("rejects apply when the branch head moved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/user/installations"))
          return new Response(JSON.stringify({ installations: [{ id: 9876 }] }));
        if (url.includes("/access_tokens"))
          return new Response(JSON.stringify({ token: "elevated-secret" }));
        if (url.includes("/installation/repositories"))
          return new Response(JSON.stringify({ repositories: [{ full_name: "owner/repo" }] }));
        if (url.endsWith("/repos/owner/repo"))
          return new Response(JSON.stringify({ default_branch: "main" }));
        if (url.includes("/git/ref/heads/main"))
          return new Response(JSON.stringify({ object: { sha: "new-head" } }));
        return new Response("unexpected", { status: 500 });
      })
    );
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/site-setup/apply", {
        method: "POST",
        headers: { Authorization: "Bearer user-token" },
        body: JSON.stringify({
          installationId: 9876,
          owner: "owner",
          repo: "repo",
          expectedHeadSha: "old-head",
          approvedConflictPaths: []
        })
      }),
      productionEnv()
    );
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("elevated-secret");
  });

  it("treats differing workflow and manifest as conflicts and preserves them without approval", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/user/installations"))
          return new Response(JSON.stringify({ installations: [{ id: 9876 }] }));
        if (url.includes("/access_tokens"))
          return new Response(JSON.stringify({ token: "setup-token" }));
        if (url.includes("/installation/repositories"))
          return new Response(JSON.stringify({ repositories: [{ full_name: "owner/repo" }] }));
        if (url.endsWith("/repos/owner/repo"))
          return new Response(JSON.stringify({ default_branch: "release" }));
        if (url.includes("/git/ref/heads/release"))
          return new Response(JSON.stringify({ object: { sha: "head-1" } }));
        if (url.includes("/contents/"))
          return new Response(
            JSON.stringify({ encoding: "base64", content: btoa("user controlled") })
          );
        if (url.endsWith("/pages")) return new Response(JSON.stringify({ build_type: "workflow" }));
        return new Response("unexpected", { status: 500 });
      })
    );
    const request = (path: "plan" | "apply", extra = {}) =>
      worker.fetch(
        new Request(`https://auth.ilm.dev/github/app/site-setup/${path}`, {
          method: "POST",
          headers: { Authorization: "Bearer user-token" },
          body: JSON.stringify({
            installationId: 9876,
            owner: "owner",
            repo: "repo",
            expectedHeadSha: "head-1",
            approvedConflictPaths: [],
            ...extra
          })
        }),
        productionEnv()
      );

    const plan = (await (await request("plan")).json()) as {
      conflicts: string[];
      updates: string[];
    };
    expect(plan.conflicts).toEqual([".github/workflows/ilm-pages.yml", ".ilm/site-manifest.json"]);
    expect(plan.updates).toEqual([]);
    const apply = await request("apply");
    expect(apply.status).toBe(409);
    expect(calls.some((url) => url.endsWith("/git/blobs"))).toBe(false);
  });

  it("overwrites only approved canonical conflicts, uses the target branch, configures Pages, then updates the ref", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let blob = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/user/installations"))
          return new Response(JSON.stringify({ installations: [{ id: 9876 }] }));
        if (url.includes("/access_tokens"))
          return new Response(JSON.stringify({ token: "setup-token" }));
        if (url.includes("/installation/repositories"))
          return new Response(JSON.stringify({ repositories: [{ full_name: "owner/repo" }] }));
        if (url.endsWith("/repos/owner/repo"))
          return new Response(JSON.stringify({ default_branch: "release" }));
        if (url.includes("/git/ref/heads/release"))
          return new Response(JSON.stringify({ object: { sha: "head-1" } }));
        if (url.includes("/contents/.github"))
          return new Response(
            JSON.stringify({ encoding: "base64", content: btoa("old workflow") })
          );
        if (url.includes("/contents/.ilm"))
          return new Response(
            JSON.stringify({ encoding: "base64", content: btoa("old manifest") })
          );
        if (url.endsWith("/pages") && !init?.method)
          return new Response(JSON.stringify({ build_type: "workflow" }));
        if (url.endsWith("/git/blobs"))
          return new Response(JSON.stringify({ sha: `blob-${++blob}` }));
        if (url.endsWith("/git/trees")) return new Response(JSON.stringify({ sha: "tree-1" }));
        if (url.endsWith("/git/commits")) return new Response(JSON.stringify({ sha: "commit-1" }));
        if (url.endsWith("/pages") && init?.method === "PUT")
          return new Response("{}", { status: 200 });
        if (url.includes("/git/refs/heads/release")) return new Response("{}", { status: 200 });
        return new Response("unexpected " + url, { status: 500 });
      })
    );
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/site-setup/apply", {
        method: "POST",
        headers: { Authorization: "Bearer user-token" },
        body: JSON.stringify({
          installationId: 9876,
          owner: "owner",
          repo: "repo",
          expectedHeadSha: "head-1",
          approvedConflictPaths: [".github/workflows/ilm-pages.yml"]
        })
      }),
      productionEnv()
    );

    expect(response.status).toBe(409);
    // Approving one conflict must not authorize the other one.
    expect(calls.filter(({ url }) => url.endsWith("/git/blobs"))).toHaveLength(0);

    calls.length = 0;
    const approvedResponse = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/site-setup/apply", {
        method: "POST",
        headers: { Authorization: "Bearer user-token" },
        body: JSON.stringify({
          installationId: 9876,
          owner: "owner",
          repo: "repo",
          expectedHeadSha: "head-1",
          approvedConflictPaths: [".github/workflows/ilm-pages.yml", ".ilm/site-manifest.json"]
        })
      }),
      productionEnv()
    );
    expect(approvedResponse.status).toBe(200);
    const blobBodies = calls
      .filter(({ url }) => url.endsWith("/git/blobs"))
      .map(({ init }) => JSON.parse(String(init?.body)) as { content: string });
    expect(blobBodies).toHaveLength(2);
    expect(blobBodies[0].content).toContain('branches: ["release"]');
    expect(blobBodies.every(({ content }) => !content.includes("<div id="))).toBe(true);
    const pagesCall = calls.find(
      ({ url, init }) => url.endsWith("/pages") && init?.method === "PUT"
    );
    expect(JSON.parse(String(pagesCall?.init?.body))).toEqual({ build_type: "workflow" });
    expect(
      calls.findIndex(({ url, init }) => url.endsWith("/pages") && init?.method === "PUT")
    ).toBeLessThan(
      calls.findIndex(
        ({ url, init }) => url.includes("/git/refs/heads/release") && init?.method === "PATCH"
      )
    );

    calls.length = 0;
    const unknownPath = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/site-setup/apply", {
        method: "POST",
        headers: { Authorization: "Bearer user-token" },
        body: JSON.stringify({
          installationId: 9876,
          owner: "owner",
          repo: "repo",
          expectedHeadSha: "head-1",
          approvedConflictPaths: ["index.html"]
        })
      }),
      productionEnv()
    );
    expect(unknownPath.status).toBe(409);
    expect(calls.filter(({ url }) => url.endsWith("/git/blobs"))).toHaveLength(0);
  });

  it("creates Pages for a fresh repository before updating the ref", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let pagesReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/user/installations"))
          return new Response(JSON.stringify({ installations: [{ id: 9876 }] }));
        if (url.includes("/access_tokens"))
          return new Response(JSON.stringify({ token: "setup-token" }));
        if (url.includes("/installation/repositories"))
          return new Response(JSON.stringify({ repositories: [{ full_name: "owner/repo" }] }));
        if (url.endsWith("/repos/owner/repo"))
          return new Response(JSON.stringify({ default_branch: "main" }));
        if (url.includes("/git/ref/heads/main"))
          return new Response(JSON.stringify({ object: { sha: "head-1" } }));
        if (url.includes("/contents/")) return new Response("missing", { status: 404 });
        if (url.endsWith("/pages") && !init?.method)
          return ++pagesReads === 1
            ? new Response("missing", { status: 404 })
            : new Response(JSON.stringify({ build_type: "workflow" }));
        if (url.endsWith("/git/blobs")) return new Response(JSON.stringify({ sha: "blob" }));
        if (url.endsWith("/git/trees")) return new Response(JSON.stringify({ sha: "tree" }));
        if (url.endsWith("/git/commits")) return new Response(JSON.stringify({ sha: "commit" }));
        if (url.endsWith("/pages") && init?.method === "POST")
          return new Response("{}", { status: 201 });
        if (url.includes("/git/refs/heads/main") && init?.method === "PATCH")
          return new Response("{}", { status: 200 });
        return new Response("unexpected", { status: 500 });
      })
    );
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/site-setup/apply", {
        method: "POST",
        headers: { Authorization: "Bearer user-token" },
        body: JSON.stringify({
          installationId: 9876,
          owner: "owner",
          repo: "repo",
          expectedHeadSha: "head-1",
          approvedConflictPaths: []
        })
      }),
      productionEnv()
    );
    expect(response.status).toBe(200);
    const create = calls.find(({ url, init }) => url.endsWith("/pages") && init?.method === "POST");
    expect(JSON.parse(String(create?.init?.body))).toEqual({ build_type: "workflow" });
    expect(
      calls.findIndex(({ url, init }) => url.endsWith("/pages") && init?.method === "POST")
    ).toBeLessThan(
      calls.findIndex(
        ({ url, init }) => url.includes("/git/refs/heads/main") && init?.method === "PATCH"
      )
    );
  });

  it("does not update the ref when fresh Pages creation fails", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/user/installations"))
          return new Response(JSON.stringify({ installations: [{ id: 9876 }] }));
        if (url.includes("/access_tokens"))
          return new Response(JSON.stringify({ token: "setup-token" }));
        if (url.includes("/installation/repositories"))
          return new Response(JSON.stringify({ repositories: [{ full_name: "owner/repo" }] }));
        if (url.endsWith("/repos/owner/repo"))
          return new Response(JSON.stringify({ default_branch: "main" }));
        if (url.includes("/git/ref/heads/main"))
          return new Response(JSON.stringify({ object: { sha: "head-1" } }));
        if (url.includes("/contents/")) return new Response("missing", { status: 404 });
        if (url.endsWith("/pages") && !init?.method)
          return new Response("missing", { status: 404 });
        if (url.endsWith("/git/blobs")) return new Response(JSON.stringify({ sha: "blob" }));
        if (url.endsWith("/git/trees")) return new Response(JSON.stringify({ sha: "tree" }));
        if (url.endsWith("/git/commits")) return new Response(JSON.stringify({ sha: "commit" }));
        if (url.endsWith("/pages") && init?.method === "POST")
          return new Response("denied", { status: 403 });
        return new Response("unexpected", { status: 500 });
      })
    );
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/site-setup/apply", {
        method: "POST",
        headers: { Authorization: "Bearer user-token" },
        body: JSON.stringify({
          installationId: 9876,
          owner: "owner",
          repo: "repo",
          expectedHeadSha: "head-1",
          approvedConflictPaths: []
        })
      }),
      productionEnv()
    );
    expect(response.status).toBe(500);
    expect(calls.some(({ url, init }) => url.endsWith("/pages") && init?.method === "POST")).toBe(
      true
    );
    expect(
      calls.some(({ url, init }) => url.includes("/git/refs/heads/") && init?.method === "PATCH")
    ).toBe(false);
  });

  it("returns a typed partial state when the ref update loses a race after Pages configuration", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/user/installations"))
          return new Response(JSON.stringify({ installations: [{ id: 9876 }] }));
        if (url.includes("/access_tokens"))
          return new Response(JSON.stringify({ token: "setup-token" }));
        if (url.includes("/installation/repositories"))
          return new Response(JSON.stringify({ repositories: [{ full_name: "owner/repo" }] }));
        if (url.endsWith("/repos/owner/repo"))
          return new Response(JSON.stringify({ default_branch: "main" }));
        if (url.includes("/git/ref/heads/main"))
          return new Response(JSON.stringify({ object: { sha: "head-1" } }));
        if (url.includes("/contents/")) return new Response("missing", { status: 404 });
        if (url.endsWith("/pages") && !init?.method)
          return new Response(JSON.stringify({ build_type: "workflow" }));
        if (url.endsWith("/git/blobs")) return new Response(JSON.stringify({ sha: "blob" }));
        if (url.endsWith("/git/trees")) return new Response(JSON.stringify({ sha: "tree" }));
        if (url.endsWith("/git/commits")) return new Response(JSON.stringify({ sha: "commit" }));
        if (url.endsWith("/pages") && init?.method === "PUT")
          return new Response("{}", { status: 200 });
        if (url.includes("/git/refs/heads/main")) return new Response("race", { status: 422 });
        return new Response("unexpected", { status: 500 });
      })
    );
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/github/app/site-setup/apply", {
        method: "POST",
        headers: { Authorization: "Bearer user-token" },
        body: JSON.stringify({
          installationId: 9876,
          owner: "owner",
          repo: "repo",
          expectedHeadSha: "head-1",
          approvedConflictPaths: []
        })
      }),
      productionEnv()
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "ref_update_failed",
      partialState: { pagesConfigured: true, refUpdated: false, commitSha: "commit" }
    });
  });

  it("adds security headers to redirects and JSON responses", async () => {
    for (const response of [
      await worker.fetch(new Request("https://auth.ilm.dev/health"), productionEnv()),
      await worker.fetch(
        new Request("https://auth.ilm.dev/github/app/callback?state=bad"),
        productionEnv()
      )
    ]) {
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("Permissions-Policy")).toBeTruthy();
    }
  });

  it("verifies reachable GitHub Pages live URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

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
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "HEAD",
        redirect: "manual",
        signal: expect.any(AbortSignal)
      })
    );
    vi.unstubAllGlobals();
  });

  it("falls back to GET for 405 and follows at most allowed GitHub Pages redirects", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://owner.github.io/repo/next" }
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", mockFetch);
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/live-url/verify", {
        method: "POST",
        body: JSON.stringify({ url: "https://owner.github.io/repo" })
      }),
      productionEnv()
    );
    expect(((await response.json()) as { status: number }).status).toBe(204);
    expect(mockFetch.mock.calls.map((call) => call[1]?.method)).toEqual(["HEAD", "GET", "GET"]);
  });

  it("refuses live URL redirects away from GitHub Pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 302, headers: { Location: "https://evil.example/" } })
        )
    );
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/live-url/verify", {
        method: "POST",
        body: JSON.stringify({ url: "https://owner.github.io/repo" })
      }),
      productionEnv()
    );
    expect(await response.json()).toMatchObject({ reachable: false });
  });

  it("stops after three live URL redirects", async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation(
        (url: string) => new Response(null, { status: 302, headers: { Location: url + "/next" } })
      );
    vi.stubGlobal("fetch", mockFetch);
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/live-url/verify", {
        method: "POST",
        body: JSON.stringify({ url: "https://owner.github.io/repo" })
      }),
      productionEnv()
    );
    expect(await response.json()).toMatchObject({ reachable: false });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it.each(["https://user:pass@owner.github.io/repo", "https://owner.github.io:444/repo"])(
    "rejects credentialed or non-default-port live URL %s",
    async (url) => {
      const response = await worker.fetch(
        new Request("https://auth.ilm.dev/live-url/verify", {
          method: "POST",
          body: JSON.stringify({ url })
        }),
        productionEnv()
      );
      expect(response.status).toBe(400);
    }
  );

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

  it("rejects the bare github.io host", async () => {
    const response = await worker.fetch(
      new Request("https://auth.ilm.dev/live-url/verify", {
        method: "POST",
        body: JSON.stringify({ url: "https://github.io/" })
      }),
      productionEnv()
    );
    expect(response.status).toBe(400);
  });
});
