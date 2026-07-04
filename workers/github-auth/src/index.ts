export interface Env {
  readonly GITHUB_APP_ID: string;
  readonly GITHUB_APP_PRIVATE_KEY?: string;
  readonly GITHUB_CLIENT_SECRET?: string;
  readonly ALLOWED_ORIGIN?: string;
}

type InstallationTokenRequestBody = {
  readonly installation_id?: number;
};

function json(data: unknown, init: ResponseInit = {}, corsOrigin: string = "*"): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": corsOrigin,
      ...init?.headers
    }
  });
}

function getAllowedOrigin(env: Env, requestOrigin: string | null): string {
  const allowed = (env.ALLOWED_ORIGIN || "http://127.0.0.1:5173").split(",").map((o) => o.trim());
  if (requestOrigin && allowed.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowed[0];
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
    pkcs8Der as any,
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

  const redirectUrl = new URL(targetOrigin);
  redirectUrl.pathname = "/dashboard";

  if (!code) {
    if (installationId) redirectUrl.searchParams.set("installation_id", installationId);
    return Response.redirect(redirectUrl.toString(), 302);
  }

  if (!env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_CLIENT_SECRET) {
    redirectUrl.searchParams.set("error", "missing_worker_secrets");
    return Response.redirect(redirectUrl.toString(), 302);
  }

  try {
    const jwt = await signJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    const appRes = await fetch("https://api.github.com/app", {
      headers: { Authorization: `Bearer ${jwt}`, "User-Agent": "ilm-github-auth" }
    });
    const appData = (await appRes.json()) as any;

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: appData.client_id,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code
      })
    });
    const tokenData = (await tokenRes.json()) as any;
    const userToken = tokenData.access_token;

    if (!userToken) {
      redirectUrl.searchParams.set("error", "auth_failed");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const instRes = await fetch("https://api.github.com/user/installations", {
      headers: { Authorization: `Bearer ${userToken}`, "User-Agent": "ilm-github-auth" }
    });
    const instData = (await instRes.json()) as any;

    if (!instData.installations || instData.installations.length === 0) {
      return Response.redirect(`${appData.html_url}/installations/new`, 302);
    }

    const targetInstallationId = instData.installations[0].id;
    const accessRes = await fetch(
      `https://api.github.com/app/installations/${targetInstallationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "User-Agent": "ilm-github-auth",
          Accept: "application/vnd.github+json"
        }
      }
    );
    const accessData = (await accessRes.json()) as any;

    redirectUrl.searchParams.set("installation_id", targetInstallationId.toString());
    redirectUrl.searchParams.set("access_token", accessData.token);
    return Response.redirect(redirectUrl.toString(), 302);
  } catch (err: any) {
    redirectUrl.searchParams.set("error", "callback_crash");
    return Response.redirect(redirectUrl.toString(), 302);
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

    const appData = (await response.json()) as any;
    return json(
      {
        appId: env.GITHUB_APP_ID,
        clientId: appData.client_id,
        name: appData.name,
        htmlUrl: appData.html_url
      },
      { status: 200 },
      corsOrigin
    );
  } catch (err: any) {
    return json(
      { error: "Failed to fetch GitHub App metadata", details: err.message },
      { status: 500 },
      corsOrigin
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get("Origin");
    const corsOrigin = getAllowedOrigin(env, requestOrigin);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
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
      let targetOrigin = corsOrigin;
      if (stateParam) {
        try {
          targetOrigin = getAllowedOrigin(env, decodeURIComponent(stateParam));
        } catch {}
      }
      return handleGitHubAppCallback(url, env, targetOrigin);
    }

    return json({ error: "Not Found" }, { status: 404 }, corsOrigin);
  }
};
