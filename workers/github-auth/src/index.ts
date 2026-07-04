export interface Env {
  readonly GITHUB_APP_ID: string;
  readonly GITHUB_APP_PRIVATE_KEY?: string;
  readonly ALLOWED_ORIGIN?: string;
}

type InstallationTokenRequestBody = {
  readonly installation_id?: number;
};

function json(data: unknown, init: ResponseInit = {}, env?: Env): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": env?.ALLOWED_ORIGIN || "*",
      ...init.headers
    }
  });
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
  const oidBytes = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0xf6, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
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
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
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

async function prepareInstallationToken(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as InstallationTokenRequestBody;
  if (!body.installation_id) {
    return json({ error: "Missing required GitHub App installation_id" }, { status: 400 }, env);
  }

  if (!env.GITHUB_APP_PRIVATE_KEY) {
    return json({ error: "GITHUB_APP_PRIVATE_KEY is not configured on the worker" }, { status: 500 }, env);
  }

  try {
    const jwt = await signJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    const response = await fetch(
      `https://api.github.com/app/installations/${body.installation_id}/access_tokens`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "ilm-github-auth"
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return json(
        { error: "GitHub API error during token exchange", details: errorText },
        { status: response.status },
        env
      );
    }

    const tokenData = await response.json();
    return json(tokenData, { status: 200 }, env);
  } catch (err: any) {
    return json(
      { error: "Failed to exchange installation token", details: err.message },
      { status: 500 },
      env
    );
  }
}

function handleGitHubAppCallback(url: URL, env: Env): Response {
  const code = url.searchParams.get("code");
  const installationId = url.searchParams.get("installation_id");

  const redirectUrl = new URL(env.ALLOWED_ORIGIN || "http://127.0.0.1:5173");
  redirectUrl.pathname = "/dashboard";
  if (installationId) {
    redirectUrl.searchParams.set("installation_id", installationId);
  }
  if (code) {
    redirectUrl.searchParams.set("code", code);
  }

  return Response.redirect(redirectUrl.toString(), 302);
}

async function handleGetAppMetadata(env: Env): Promise<Response> {
  if (!env.GITHUB_APP_PRIVATE_KEY) {
    return json({ error: "GITHUB_APP_PRIVATE_KEY is not configured on the worker" }, { status: 500 }, env);
  }

  try {
    const jwt = await signJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    const response = await fetch("https://api.github.com/app", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "ilm-github-auth"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return json(
        { error: "GitHub API error fetching App metadata", details: errorText },
        { status: response.status },
        env
      );
    }

    const appData = await response.json() as any;
    return json(
      {
        appId: env.GITHUB_APP_ID,
        clientId: appData.client_id,
        name: appData.name,
        htmlUrl: appData.html_url
      },
      { status: 200 },
      env
    );
  } catch (err: any) {
    return json(
      { error: "Failed to fetch GitHub App metadata", details: err.message },
      { status: 500 },
      env
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    if (url.pathname === "/health") {
      return json({ ok: true }, { status: 200 }, env);
    }

    if (url.pathname === "/github/app/metadata" && request.method === "GET") {
      return handleGetAppMetadata(env);
    }

    if (url.pathname === "/github/app/installation-token" && request.method === "POST") {
      return prepareInstallationToken(request, env);
    }

    if (url.pathname === "/github/app/callback" && request.method === "GET") {
      return handleGitHubAppCallback(url, env);
    }

    return json({ error: "Not Found" }, { status: 404 }, env);
  }
};
