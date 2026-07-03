export interface Env {
  readonly GITHUB_CLIENT_SECRET: string;
}

type TokenRequestBody = {
  readonly code?: string;
  readonly client_id?: string;
  readonly redirect_uri?: string;
  readonly code_verifier?: string;
};

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers
    }
  });
}

async function exchangeGitHubToken(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as TokenRequestBody;
  if (!body.code || !body.client_id || !body.redirect_uri || !body.code_verifier) {
    return json({ error: "Missing required OAuth exchange fields" }, { status: 400 });
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: body.client_id,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: body.code,
      redirect_uri: body.redirect_uri,
      code_verifier: body.code_verifier
    })
  });

  const tokenPayload = await response.json();
  return json(tokenPayload, { status: response.status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/github/oauth/token" && request.method === "POST") {
      return exchangeGitHubToken(request, env);
    }

    return json({ error: "Not Found" }, { status: 404 });
  }
};
