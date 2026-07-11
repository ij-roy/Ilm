export type OAuthState = {
  readonly nonce: string;
  readonly origin: string;
};

export type StoredCmsStateV2 = {
  readonly schemaVersion: 2;
  readonly selectedRepositoryKey?: string;
  readonly workspaces: Record<string, Record<string, unknown>>;
  readonly geminiEncryptedKey?: string;
};

const localCredentialKeys = new Set([
  "geminiApiKey",
  "userToken",
  "accessToken",
  "refreshToken",
  "installationId",
  "accessTokenExpiresAt"
]);

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function createOAuthState(nonce: string, origin: string): string {
  return encodeBase64Url(JSON.stringify({ nonce, origin } satisfies OAuthState));
}

export function parseOAuthState(value: string): OAuthState {
  const parsed = JSON.parse(decodeBase64Url(value)) as Partial<OAuthState>;
  if (!parsed.nonce || !parsed.origin || new URL(parsed.origin).origin !== parsed.origin) {
    throw new Error("Invalid OAuth state");
  }
  return { nonce: parsed.nonce, origin: parsed.origin };
}

export function sanitizeStateForStorage<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStateForStorage(item)) as T;
  }
  if (!value || typeof value !== "object") return value;

  const safe: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!localCredentialKeys.has(key)) safe[key] = sanitizeStateForStorage(item);
  }
  return safe as T;
}

export function createRepositoryStorageKey(repository: {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
}): string {
  return `${repository.owner}/${repository.repo}/${repository.branch}`.toLowerCase();
}

export function migrateLegacyCmsState(value: unknown): StoredCmsStateV2 {
  const safe = sanitizeStateForStorage(
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  );
  if (safe.schemaVersion === 2 && safe.workspaces && typeof safe.workspaces === "object") {
    return safe as StoredCmsStateV2;
  }

  const repository = safe.repository as
    { readonly owner?: string; readonly repo?: string; readonly branch?: string } | undefined;
  const repositoryKey =
    repository?.owner && repository.repo && repository.branch
      ? createRepositoryStorageKey({
          owner: repository.owner,
          repo: repository.repo,
          branch: repository.branch
        })
      : undefined;
  const workspace = sanitizeStateForStorage({
    activeDraft: safe.activeDraft,
    drafts: safe.drafts ?? [],
    posts: safe.posts ?? [],
    media: safe.media ?? [],
    events: safe.events ?? [],
    repository: safe.repository,
    siteUrl: safe.siteUrl,
    siteHomeUrl: safe.siteHomeUrl
  });

  return {
    schemaVersion: 2,
    selectedRepositoryKey: repositoryKey,
    workspaces: repositoryKey ? { [repositoryKey]: workspace } : {},
    ...(typeof safe.geminiEncryptedKey === "string"
      ? { geminiEncryptedKey: safe.geminiEncryptedKey }
      : {})
  };
}
