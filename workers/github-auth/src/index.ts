export interface Env {
  readonly GITHUB_APP_ID: string;
  readonly GITHUB_APP_PRIVATE_KEY?: string;
  readonly GITHUB_CLIENT_SECRET?: string;
  readonly ALLOWED_ORIGIN?: string;
}

function json(data: unknown, init: ResponseInit = {}, corsOrigin: string = "*"): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": corsOrigin,
      ...securityHeaders,
      ...init?.headers
    }
  });
}

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
} as const;

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location, ...securityHeaders } });
}

const contentInstallationPermissions = ["Contents: write", "Actions: read"] as const;

type InstallationTokenPurpose = "content";

function getInstallationTokenPermissions(purpose: InstallationTokenPurpose) {
  void purpose;
  return { contents: "write", actions: "read", metadata: "read" };
}

function getRequiredPermissionLabels(purpose: InstallationTokenPurpose) {
  void purpose;
  return contentInstallationPermissions;
}

type GitHubErrorPayload = {
  readonly message?: string;
  readonly errors?: readonly {
    readonly message?: string;
  }[];
};

function describeGitHubError(text: string): string {
  try {
    const payload = JSON.parse(text) as GitHubErrorPayload;
    const messages = [
      payload.message,
      ...(payload.errors ?? []).map((error) => error.message)
    ].filter((message): message is string => Boolean(message));
    return messages.length > 0 ? messages.join(": ") : text;
  } catch {
    return text;
  }
}

function getAllowedOrigin(env: Env, requestOrigin: string | null): string {
  const allowed = getAllowedOrigins(env);
  if (requestOrigin && allowed.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowed.find((origin) => origin.startsWith("https://")) ?? allowed[0];
}

function getAllowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGIN || "http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function decodeOAuthState(
  state: string | null,
  env: Env
): { encoded: string; origin: string } | null {
  if (!state) return null;
  try {
    const base64 = state.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const value = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))
    ) as {
      nonce?: unknown;
      origin?: unknown;
    };
    if (typeof value.nonce !== "string" || !value.nonce || typeof value.origin !== "string")
      return null;
    const origin = new URL(value.origin).origin;
    if (origin !== value.origin.replace(/\/$/, "") || !getAllowedOrigins(env).includes(origin))
      return null;
    return { encoded: state, origin };
  } catch {
    return null;
  }
}

function pemToDer(pem: string): Uint8Array {
  const cleanPem = pem
    .replace(/-----BEGIN[^-]+-----/, "")
    .replace(/-----END[^-]+-----/, "")
    .replace(/\s+/g, "");
  const binaryStr = atob(cleanPem);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

function encodeLength(len: number): number[] {
  if (len < 128) {
    return [len];
  }
  const bytes = [];
  while (len > 0) {
    bytes.unshift(len & 0xff);
    len >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function pkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  const oidBytes = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0xf6, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00
  ];
  const octetStringLength = encodeLength(pkcs1Der.length);
  const innerLen = 3 + oidBytes.length + octetStringLength.length + pkcs1Der.length;
  const outerLength = encodeLength(innerLen);

  const pkcs8 = new Uint8Array(
    1 + outerLength.length + 3 + oidBytes.length + octetStringLength.length + pkcs1Der.length
  );

  let offset = 0;
  pkcs8[offset++] = 0x30;
  pkcs8.set(outerLength, offset);
  offset += outerLength.length;

  pkcs8[offset++] = 0x02;
  pkcs8[offset++] = 0x01;
  pkcs8[offset++] = 0x00;

  pkcs8.set(oidBytes, offset);
  offset += oidBytes.length;

  pkcs8[offset++] = 0x04;
  pkcs8.set(octetStringLength, offset);
  offset += octetStringLength.length;

  pkcs8.set(pkcs1Der, offset);
  return pkcs8;
}

function base64UrlEncode(arr: Uint8Array): string {
  const binary = Array.from(arr, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signJwt(appId: string, privateKeyPem: string): Promise<string> {
  const der = pemToDer(privateKeyPem);
  const isPkcs1 = privateKeyPem.includes("BEGIN RSA PRIVATE KEY");
  const pkcs8Der = isPkcs1 ? pkcs1ToPkcs8(der) : der;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Der as BufferSource,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 10 * 60,
    iss: appId
  };

  const encoder = new TextEncoder();
  const headerStr = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadStr = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerStr}.${payloadStr}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signingInput)
  );

  const signatureStr = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${signatureStr}`;
}

async function handleGitHubAppCallback(
  url: URL,
  env: Env,
  targetOrigin: string
): Promise<Response> {
  const code = url.searchParams.get("code");
  const installationId = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  const redirectUrl = new URL(targetOrigin);
  redirectUrl.pathname = "/dashboard";

  if (setupAction) {
    redirectUrl.searchParams.set("setup_action", setupAction);
  }

  if (oauthError) {
    const hashParams = new URLSearchParams();
    hashParams.set("error", oauthError);
    if (oauthErrorDescription) hashParams.set("error_description", oauthErrorDescription);
    if (state) hashParams.set("state", state);
    if (installationId) hashParams.set("installation_id", installationId);
    redirectUrl.hash = hashParams.toString();
    return redirect(redirectUrl.toString());
  }

  if (!code) {
    const hashParams = new URLSearchParams();
    hashParams.set("error", "missing_code");
    if (installationId) hashParams.set("installation_id", installationId);
    if (state) hashParams.set("state", state);
    redirectUrl.hash = hashParams.toString();
    return redirect(redirectUrl.toString());
  }

  if (!env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_CLIENT_SECRET) {
    const hashParams = new URLSearchParams();
    hashParams.set("error", "missing_worker_secrets");
    if (state) hashParams.set("state", state);
    redirectUrl.hash = hashParams.toString();
    return redirect(redirectUrl.toString());
  }

  try {
    const jwt = await signJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    const appRes = await fetch("https://api.github.com/app", {
      headers: { Authorization: `Bearer ${jwt}`, "User-Agent": "ilm-github-auth" }
    });
    const appData = (await appRes.json()) as { client_id: string; html_url: string };

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: appData.client_id,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code
      })
    });
    const tokenData = (await tokenRes.json()) as { access_token: string };
    const userToken = tokenData.access_token;

    const hashParams = new URLSearchParams();
    if (installationId) {
      hashParams.set("installation_id", installationId);
    }
    if (state) {
      hashParams.set("state", state);
    }

    if (!userToken) {
      hashParams.set("error", "auth_failed");
      redirectUrl.hash = hashParams.toString();
      return redirect(redirectUrl.toString());
    }

    hashParams.set("user_token", userToken);
    redirectUrl.hash = hashParams.toString();
    return redirect(redirectUrl.toString());
  } catch {
    const hashParams = new URLSearchParams();
    hashParams.set("error", "callback_crash");
    if (state) hashParams.set("state", state);
    redirectUrl.hash = hashParams.toString();
    return redirect(redirectUrl.toString());
  }
}

async function handleGetAppMetadata(env: Env, corsOrigin: string): Promise<Response> {
  if (!env.GITHUB_APP_PRIVATE_KEY) {
    return json(
      { error: "GITHUB_APP_PRIVATE_KEY is not configured on the worker" },
      { status: 500 },
      corsOrigin
    );
  }

  try {
    const jwt = await signJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    const response = await fetch("https://api.github.com/app", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "ilm-github-auth"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return json(
        { error: "GitHub API error fetching App metadata", details: errorText },
        { status: response.status },
        corsOrigin
      );
    }

    const appData = (await response.json()) as {
      client_id: string;
      name: string;
      html_url: string;
    };
    return json(
      {
        apiVersion: 2,
        appId: env.GITHUB_APP_ID,
        clientId: appData.client_id,
        name: appData.name,
        htmlUrl: appData.html_url
      },
      { status: 200 },
      corsOrigin
    );
  } catch (err: unknown) {
    return json(
      { error: "Failed to fetch GitHub App metadata", details: (err as Error).message },
      { status: 500 },
      corsOrigin
    );
  }
}

async function handleGenerateInstallationToken(
  request: Request,
  env: Env,
  corsOrigin: string
): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing or invalid Authorization header" }, { status: 401 }, corsOrigin);
  }
  const userToken = authHeader.substring(7);

  let body: { installationId: number; purpose?: InstallationTokenPurpose };
  try {
    body = (await request.json()) as { installationId: number; purpose?: InstallationTokenPurpose };
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 }, corsOrigin);
  }

  if (!body.installationId) {
    return json({ error: "Missing installationId" }, { status: 400 }, corsOrigin);
  }

  if (body.purpose !== undefined && body.purpose !== "content") {
    return json({ error: "Unsupported installation token purpose" }, { status: 400 }, corsOrigin);
  }

  if (!env.GITHUB_APP_PRIVATE_KEY) {
    return json({ error: "Worker missing private key" }, { status: 500 }, corsOrigin);
  }

  try {
    // Verify user has access to this installation
    const instRes = await fetch("https://api.github.com/user/installations", {
      headers: { Authorization: `Bearer ${userToken}`, "User-Agent": "ilm-github-auth" }
    });

    if (!instRes.ok) {
      return json(
        { error: "Failed to fetch user installations" },
        { status: instRes.status },
        corsOrigin
      );
    }

    const instData = (await instRes.json()) as { installations: Array<{ id: number }> };
    const hasAccess = instData.installations.some((inst) => inst.id === body.installationId);

    if (!hasAccess) {
      return json(
        { error: "User does not have access to this installation" },
        { status: 403 },
        corsOrigin
      );
    }

    // Generate installation token
    const jwt = await signJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    const accessRes = await fetch(
      `https://api.github.com/app/installations/${body.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "User-Agent": "ilm-github-auth",
          Accept: "application/vnd.github+json"
        },
        body: JSON.stringify({
          permissions: getInstallationTokenPermissions(body.purpose ?? "content")
        })
      }
    );

    if (!accessRes.ok) {
      const errText = await accessRes.text();
      const details = describeGitHubError(errText);
      return json(
        {
          error: "GitHub App permissions are not approved for this installation",
          details,
          requiredPermissions: getRequiredPermissionLabels(body.purpose ?? "content")
        },
        { status: accessRes.status },
        corsOrigin
      );
    }

    const accessData = (await accessRes.json()) as { token: string; expires_at?: string };
    return json(
      { token: accessData.token, expiresAt: accessData.expires_at },
      { status: 200 },
      corsOrigin
    );
  } catch (err: unknown) {
    return json(
      { error: "Server error", details: (err as Error).message },
      { status: 500 },
      corsOrigin
    );
  }
}

function getCanonicalSetupFiles(branch: string): Readonly<Record<string, string>> {
  return {
    ".github/workflows/ilm-pages.yml": `name: Deploy Ilm site
on:
  push:
    branches: [${JSON.stringify(branch)}]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
`,
    ".ilm/site-manifest.json":
      JSON.stringify(
        {
          templateVersion: "2",
          managedBy: "ilm",
          managedFiles: [".github/workflows/ilm-pages.yml", ".ilm/site-manifest.json"]
        },
        null,
        2
      ) + "\n"
  };
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "ilm-github-auth"
  };
}

async function hasInstallation(userToken: string, installationId: number): Promise<boolean> {
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(
      `https://api.github.com/user/installations?per_page=100&page=${page}`,
      { headers: githubHeaders(userToken) }
    );
    if (!response.ok) throw new Error(`installations:${response.status}`);
    const data = (await response.json()) as {
      installations: Array<{ id: number }>;
      total_count?: number;
    };
    if (data.installations.some((item) => item.id === installationId)) return true;
    if (data.installations.length < 100 && (data.total_count ?? 0) <= page * 100) return false;
  }
  return false;
}

async function mintSetupToken(env: Env, installationId: number): Promise<string> {
  if (!env.GITHUB_APP_PRIVATE_KEY) throw new Error("Worker missing private key");
  const jwt = await signJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: githubHeaders(jwt),
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
    }
  );
  if (!response.ok) throw new Error(`setup-token:${response.status}`);
  return ((await response.json()) as { token: string }).token;
}

async function installationHasRepo(token: string, fullName: string): Promise<boolean> {
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(
      `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
      { headers: githubHeaders(token) }
    );
    if (!response.ok) throw new Error(`repositories:${response.status}`);
    const data = (await response.json()) as {
      repositories: Array<{ full_name: string }>;
      total_count?: number;
    };
    if (data.repositories.some((repo) => repo.full_name.toLowerCase() === fullName.toLowerCase()))
      return true;
    if (data.repositories.length < 100 && (data.total_count ?? 0) <= page * 100) return false;
  }
  return false;
}

type SetupContext = { token: string; owner: string; repo: string; branch: string; headSha: string };

async function authorizeSetup(
  request: Request,
  env: Env,
  body: { installationId?: number; owner?: string; repo?: string }
): Promise<SetupContext | Response> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer "))
    return json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  if (
    !body.installationId ||
    !body.owner ||
    !body.repo ||
    !/^[A-Za-z0-9_.-]+$/.test(body.owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(body.repo)
  ) {
    return json({ error: "Invalid setup request" }, { status: 400 });
  }
  if (!(await hasInstallation(auth.slice(7), body.installationId)))
    return json({ error: "Installation access denied" }, { status: 403 });
  const token = await mintSetupToken(env, body.installationId);
  if (!(await installationHasRepo(token, `${body.owner}/${body.repo}`)))
    return json({ error: "Repository access denied" }, { status: 403 });
  const repository = await fetch(`https://api.github.com/repos/${body.owner}/${body.repo}`, {
    headers: githubHeaders(token)
  });
  if (!repository.ok)
    return json({ error: "Repository access denied" }, { status: repository.status });
  const branch = ((await repository.json()) as { default_branch: string }).default_branch;
  const ref = await fetch(
    `https://api.github.com/repos/${body.owner}/${body.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) }
  );
  if (!ref.ok) return json({ error: "Failed to read branch head" }, { status: ref.status });
  const headSha = ((await ref.json()) as { object: { sha: string } }).object.sha;
  return { token, owner: body.owner, repo: body.repo, branch, headSha };
}

async function readContent(context: SetupContext, path: string): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${context.owner}/${context.repo}/contents/${path}?ref=${encodeURIComponent(context.branch)}`,
    { headers: githubHeaders(context.token) }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`content:${response.status}`);
  const data = (await response.json()) as { content: string; encoding: string };
  if (data.encoding !== "base64") throw new Error("Unsupported content encoding");
  return new TextDecoder().decode(
    Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) => c.charCodeAt(0))
  );
}

async function buildSetupPlan(context: SetupContext) {
  const additions: string[] = [],
    updates: string[] = [],
    conflicts: string[] = [],
    unchanged: string[] = [];
  for (const [path, canonical] of Object.entries(getCanonicalSetupFiles(context.branch))) {
    const current = await readContent(context, path);
    if (current === null) additions.push(path);
    else if (current === canonical) unchanged.push(path);
    else conflicts.push(path);
  }
  const pages = await fetch(`https://api.github.com/repos/${context.owner}/${context.repo}/pages`, {
    headers: githubHeaders(context.token)
  });
  const pagesStatus =
    pages.status === 404
      ? "not_configured"
      : pages.ok
        ? (((await pages.json()) as { build_type?: string }).build_type ?? "configured")
        : "unknown";
  return {
    headSha: context.headSha,
    templateVersion: "2",
    additions,
    updates,
    conflicts,
    unchanged,
    pagesStatus
  };
}

async function handleSiteSetup(
  request: Request,
  env: Env,
  corsOrigin: string,
  apply: boolean
): Promise<Response> {
  let body: {
    installationId?: number;
    owner?: string;
    repo?: string;
    expectedHeadSha?: string;
    approvedConflictPaths?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 }, corsOrigin);
  }
  try {
    const authorized = await authorizeSetup(request, env, body);
    if (authorized instanceof Response)
      return json(await authorized.json(), { status: authorized.status }, corsOrigin);
    if (!apply) return json(await buildSetupPlan(authorized), { status: 200 }, corsOrigin);
    if (!body.expectedHeadSha || authorized.headSha !== body.expectedHeadSha)
      return json(
        { error: "Branch head moved", headSha: authorized.headSha },
        { status: 409 },
        corsOrigin
      );
    const plan = await buildSetupPlan(authorized);
    const canonicalSetupFiles = getCanonicalSetupFiles(authorized.branch);
    const approved = new Set(
      Array.isArray(body.approvedConflictPaths) ? body.approvedConflictPaths : []
    );
    const invalidApproval = [...approved].some((path) => !Object.hasOwn(canonicalSetupFiles, path));
    const unapproved = plan.conflicts.filter((path) => !approved.has(path));
    if (invalidApproval || unapproved.length)
      return json(
        { error: "Unapproved conflicts", conflicts: unapproved },
        { status: 409 },
        corsOrigin
      );

    const writePaths = [...plan.additions, ...plan.updates, ...plan.conflicts];
    const tree: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
    for (const path of writePaths) {
      const blob = await fetch(
        `https://api.github.com/repos/${authorized.owner}/${authorized.repo}/git/blobs`,
        {
          method: "POST",
          headers: githubHeaders(authorized.token),
          body: JSON.stringify({ content: canonicalSetupFiles[path], encoding: "utf-8" })
        }
      );
      if (!blob.ok) throw new Error(`blob:${blob.status}`);
      tree.push({
        path,
        mode: "100644",
        type: "blob",
        sha: ((await blob.json()) as { sha: string }).sha
      });
    }
    let commitSha = authorized.headSha;
    if (tree.length) {
      const treeResponse = await fetch(
        `https://api.github.com/repos/${authorized.owner}/${authorized.repo}/git/trees`,
        {
          method: "POST",
          headers: githubHeaders(authorized.token),
          body: JSON.stringify({ base_tree: authorized.headSha, tree })
        }
      );
      if (!treeResponse.ok) throw new Error(`tree:${treeResponse.status}`);
      const treeSha = ((await treeResponse.json()) as { sha: string }).sha;
      const commit = await fetch(
        `https://api.github.com/repos/${authorized.owner}/${authorized.repo}/git/commits`,
        {
          method: "POST",
          headers: githubHeaders(authorized.token),
          body: JSON.stringify({
            message: "Configure Ilm site",
            tree: treeSha,
            parents: [authorized.headSha]
          })
        }
      );
      if (!commit.ok) throw new Error(`commit:${commit.status}`);
      commitSha = ((await commit.json()) as { sha: string }).sha;
    }
    const pagesUrl = `https://api.github.com/repos/${authorized.owner}/${authorized.repo}/pages`;
    const pages = await fetch(pagesUrl, {
      method: plan.pagesStatus === "not_configured" ? "POST" : "PUT",
      headers: githubHeaders(authorized.token),
      body: JSON.stringify({ build_type: "workflow" })
    });
    if (!pages.ok) throw new Error(`pages:${pages.status}`);
    const pagesValidation = await fetch(pagesUrl, { headers: githubHeaders(authorized.token) });
    if (
      !pagesValidation.ok ||
      ((await pagesValidation.json()) as { build_type?: string }).build_type !== "workflow"
    ) {
      throw new Error("pages:workflow_mode_not_confirmed");
    }
    if (tree.length) {
      const update = await fetch(
        `https://api.github.com/repos/${authorized.owner}/${authorized.repo}/git/refs/heads/${encodeURIComponent(authorized.branch)}`,
        {
          method: "PATCH",
          headers: githubHeaders(authorized.token),
          body: JSON.stringify({ sha: commitSha, force: false })
        }
      );
      if (!update.ok) {
        return json(
          {
            error: "ref_update_failed",
            partialState: { pagesConfigured: true, refUpdated: false, commitSha }
          },
          { status: 409 },
          corsOrigin
        );
      }
    }
    return json(
      { headSha: commitSha, templateVersion: "2", applied: writePaths },
      { status: 200 },
      corsOrigin
    );
  } catch (error) {
    return json(
      { error: "Site setup failed", details: (error as Error).message },
      { status: 500 },
      corsOrigin
    );
  }
}

async function handleVerifyLiveUrl(request: Request, corsOrigin: string): Promise<Response> {
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 }, corsOrigin);
  }

  if (!body.url) {
    return json({ error: "Missing url" }, { status: 400 }, corsOrigin);
  }

  let target: URL;
  try {
    target = new URL(body.url);
  } catch {
    return json({ error: "Invalid url" }, { status: 400 }, corsOrigin);
  }

  if (!isAllowedLiveUrl(target)) {
    return json(
      { error: "Only HTTPS GitHub Pages URLs can be verified" },
      { status: 400 },
      corsOrigin
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let current = target;
    let method: "HEAD" | "GET" = "HEAD";
    let response: Response;
    try {
      for (let redirects = 0; ; redirects++) {
        response = await fetch(current.toString(), {
          method,
          redirect: "manual",
          signal: controller.signal
        });
        if (response.status === 405 && method === "HEAD") {
          method = "GET";
          continue;
        }
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("Location");
          if (!location || redirects >= 3) throw new Error("Too many or invalid redirects");
          const next = new URL(location, current);
          if (!isAllowedLiveUrl(next))
            throw new Error("Redirect target is not an allowed GitHub Pages URL");
          current = next;
          continue;
        }
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
    return json(
      {
        reachable: response.ok,
        status: response.status,
        url: current.toString()
      },
      { status: 200 },
      corsOrigin
    );
  } catch (err: unknown) {
    return json(
      {
        reachable: false,
        error: (err as Error).message,
        url: target.toString()
      },
      { status: 200 },
      corsOrigin
    );
  }
}

function isAllowedLiveUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    url.hostname.endsWith(".github.io") &&
    url.hostname.length > ".github.io".length
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get("Origin");
    const corsOrigin = getAllowedOrigin(env, requestOrigin);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...securityHeaders,
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    if (url.pathname === "/health") {
      return json({ ok: true }, { status: 200 }, corsOrigin);
    }

    if (url.pathname === "/github/app/metadata" && request.method === "GET") {
      return handleGetAppMetadata(env, corsOrigin);
    }

    if (url.pathname === "/github/app/callback" && request.method === "GET") {
      const stateParam = url.searchParams.get("state");
      const state = decodeOAuthState(stateParam, env);
      if (!state) {
        const invalid = new URL("/dashboard", getAllowedOrigin(env, null));
        invalid.hash = "error=invalid_state";
        return redirect(invalid.toString());
      }
      return handleGitHubAppCallback(url, env, state.origin);
    }

    if (url.pathname === "/github/app/installation-token" && request.method === "POST") {
      return handleGenerateInstallationToken(request, env, corsOrigin);
    }

    if (url.pathname === "/github/app/site-setup/plan" && request.method === "POST") {
      return handleSiteSetup(request, env, corsOrigin, false);
    }

    if (url.pathname === "/github/app/site-setup/apply" && request.method === "POST") {
      return handleSiteSetup(request, env, corsOrigin, true);
    }

    if (url.pathname === "/live-url/verify" && request.method === "POST") {
      return handleVerifyLiveUrl(request, corsOrigin);
    }

    return json({ error: "Not Found" }, { status: 404 }, corsOrigin);
  }
};
