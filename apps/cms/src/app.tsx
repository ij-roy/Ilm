import * as React from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  FileText,
  FolderGit2,
  Image,
  KeyRound,
  LayoutDashboard,
  PenLine,
  Search,
  Settings,
  Sparkles,
  UploadCloud,
  Bold,
  Italic,
  Code,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlertTriangle,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  GripVertical
} from "lucide-react";
import { generateGeminiSuggestion, AiSuggestion, AiSuggestionKind } from "@ilm/ai";
import { createGoogleOAuthUrl } from "@ilm/analytics";
import {
  estimateReadingTimeMinutes,
  extractOutline,
  isLocalDraftNewer,
  defaultEditorExtensions
} from "@ilm/editor";
import { useEditor, EditorContent } from "@tiptap/react";
import {
  GitHubClient,
  LocalGitHubClient,
  manifestToCommitRequest,
  GitHubRepositorySummary,
  GitHubPagesSite
} from "@ilm/github";
import { planMediaAsset, convertImageToWebP } from "@ilm/media";
import {
  createDraftSavePlan,
  createPublishPlan,
  validatePublishPlan,
  PublishProgressStage
} from "@ilm/publishing";
import {
  DraftFrontmatter,
  RepositoryEntry,
  RepositoryLayout,
  validateRepositoryStructure
} from "@ilm/repository";
import { generateSeoMetadata, generateSlug, scoreSeo } from "@ilm/seo";
import { LandingPage } from "./landing";
import { DocsPage } from "./docs";
import { PrivacyPage } from "./privacy";
import { Button } from "@ilm/ui";

type ConnectedRepository = {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly fullName: string;
};

type DraftRecord = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly author: string;
  readonly tags: string;
  readonly categories: string;
  readonly markdown: string;
  readonly updatedAt: string;
  readonly savedSha?: string;
  readonly publishedSha?: string;
};

type MediaRecord = {
  readonly id: string;
  readonly fileName: string;
  readonly kind: "image" | "cover" | "attachment";
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly alt: string;
  readonly caption: string;
  readonly path: string;
  readonly contentBase64?: string;
};

type PublishEvent = {
  readonly id: string;
  readonly stage: string;
  readonly message: string;
  readonly createdAt: string;
};

type AppMetadata = {
  readonly appId: string;
  readonly clientId: string;
  readonly name: string;
  readonly htmlUrl: string;
};

type AuthSession = {
  readonly userToken: string;
  readonly installationId?: string;
  readonly accessToken?: string;
  readonly accessTokenExpiresAt?: string;
};

type AuthStatus =
  | "signed-out"
  | "loading-metadata"
  | "connecting"
  | "authenticated"
  | "selecting-repo"
  | "repo-connected"
  | "expired"
  | "error";

type CmsState = {
  readonly repository?: ConnectedRepository;
  readonly availableRepositories?: readonly GitHubRepositorySummary[];
  readonly activeDraft: DraftRecord;
  readonly drafts: readonly DraftRecord[];
  readonly posts: readonly DraftRecord[];
  readonly media: readonly MediaRecord[];
  readonly events: readonly PublishEvent[];
  readonly aiSuggestion?: AiSuggestion;
  readonly publishProgress?: PublishProgressStage;
  readonly livePostUrl?: string;
  readonly siteHomeUrl?: string;
  readonly geminiApiKey: string;
  readonly geminiEncryptedKey: string;
  readonly googleAnalyticsId: string;
  readonly siteUrl: string;
  readonly isInitializingTemplate?: boolean;
};

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Editor", href: "/editor", icon: PenLine },
  { label: "Blogs", href: "/blogs", icon: FileText },
  { label: "Drafts", href: "/drafts", icon: FolderGit2 },
  { label: "Media", href: "/media", icon: Image },
  { label: "Search", href: "/search", icon: Search },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings }
];

const PRIMARY_SITE_URL = "https://ilm.dophera.tech";
const SOCIAL_IMAGE_URL = `${PRIMARY_SITE_URL}/og-image.svg`;
const DASHBOARD_SIDEBAR_WIDTH_STORAGE_KEY = "ilm.dashboard.sidebarWidth.v1";
const DASHBOARD_SIDEBAR_COLLAPSED_STORAGE_KEY = "ilm.dashboard.sidebarCollapsed.v1";
const DASHBOARD_ACTIVITY_WIDTH_STORAGE_KEY = "ilm.dashboard.activityWidth.v1";
const DASHBOARD_SIDEBAR_WIDTH_DEFAULT = 270;
const DASHBOARD_SIDEBAR_WIDTH_MIN = 220;
const DASHBOARD_SIDEBAR_WIDTH_MAX = 420;
const DASHBOARD_SIDEBAR_WIDTH_COLLAPSED = 76;
const DASHBOARD_ACTIVITY_WIDTH_DEFAULT = 360;
const DASHBOARD_ACTIVITY_WIDTH_MIN = 280;
const DASHBOARD_ACTIVITY_WIDTH_MAX = 560;

type RouteSeo = {
  readonly title: string;
  readonly description: string;
  readonly indexable: boolean;
};

const publicRouteSeo: Record<string, RouteSeo> = {
  "/": {
    title: "Ilm — Git-native CMS for Markdown publishing",
    description:
      "Own your publishing workflow with a Git-native CMS that writes portable Markdown directly to GitHub.",
    indexable: true
  },
  "/docs": {
    title: "Ilm Docs — Git-native CMS documentation",
    description:
      "Learn how Ilm connects GitHub, Markdown publishing, SEO metadata, and static site workflows.",
    indexable: true
  },
  "/privacy": {
    title: "Ilm Privacy Policy",
    description:
      "How Ilm handles repository data, browser storage, analytics, and AI provider connections.",
    indexable: true
  }
};

function normalizePathname(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

function getSeoUrl(pathname: string): string {
  const normalizedPath = normalizePathname(pathname);
  const canonicalPath = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
  return new URL(canonicalPath, PRIMARY_SITE_URL).toString();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function readStoredNumber(key: string, fallback: number): number {
  const stored = window.localStorage.getItem(key);
  if (!stored) return fallback;

  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;

  return stored === "true";
}

function upsertMeta(attribute: "name" | "property", key: string, content: string | null) {
  const selector = `meta[${attribute}="${key}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!content) {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertCanonical(href: string | null) {
  const selector = 'link[rel="canonical"]';
  let element = document.head.querySelector<HTMLLinkElement>(selector);

  if (!href) {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
}

function RouteSeo() {
  const location = useLocation();

  React.useEffect(() => {
    const pathname = normalizePathname(location.pathname);
    const routeSeo = publicRouteSeo[pathname] ?? {
      title: "Ilm CMS — Private workspace",
      description: "Authenticated workspace for editing and publishing content with Ilm.",
      indexable: false
    };

    const robots = routeSeo.indexable
      ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
      : "noindex,nofollow";
    const canonicalUrl = routeSeo.indexable ? getSeoUrl(pathname) : null;

    document.title = routeSeo.title;
    upsertMeta("name", "description", routeSeo.description);
    upsertMeta("name", "robots", robots);
    upsertMeta("name", "googlebot", robots);
    upsertMeta("name", "application-name", "Ilm");
    upsertMeta("name", "theme-color", "#000000");
    upsertMeta("property", "og:title", routeSeo.title);
    upsertMeta("property", "og:description", routeSeo.description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", "Ilm");
    upsertMeta("property", "og:url", canonicalUrl ?? PRIMARY_SITE_URL);
    upsertMeta("property", "og:image", SOCIAL_IMAGE_URL);
    upsertMeta("property", "og:image:alt", "Ilm — Git-native CMS for Markdown publishing");
    upsertMeta("property", "og:image:width", "1200");
    upsertMeta("property", "og:image:height", "630");
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", routeSeo.title);
    upsertMeta("name", "twitter:description", routeSeo.description);
    upsertMeta("name", "twitter:image", SOCIAL_IMAGE_URL);
    upsertMeta("name", "twitter:image:alt", "Ilm — Git-native CMS for Markdown publishing");
    upsertCanonical(canonicalUrl);
  }, [location.pathname]);

  return null;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(plaintext: string, passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decryptData(ciphertextBase64: string, passphrase: string): Promise<string> {
  const binary = atob(ciphertextBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const encrypted = bytes.slice(28);

  const key = await deriveKey(passphrase, salt);
  const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);

  return new TextDecoder().decode(decrypted);
}

const storageKey = "ilm.cms.state.v1";
const authSessionKey = "ilm.auth.session";
const pendingAuthStateKey = "ilm.auth.pendingState";
const defaultLocalGithubClient = new LocalGitHubClient();

const initialDraft: DraftRecord = {
  id: "draft-local",
  title: "Own your publishing workflow",
  slug: "own-your-publishing-workflow",
  description: "A practical note about writing, saving, and publishing with a Git-native CMS.",
  author: "Ilm Author",
  tags: "cms, github, publishing",
  categories: "engineering",
  markdown:
    "# Own your publishing workflow\n\nIlm writes portable Markdown into a user-owned GitHub repository.\n\n## Why it matters\n\nContent remains independent from the CMS implementation.",
  updatedAt: new Date().toISOString()
};

function createInitialState(): CmsState {
  return {
    activeDraft: initialDraft,
    drafts: [],
    posts: [],
    media: [],
    events: [],
    livePostUrl: "",
    siteHomeUrl: "",
    geminiApiKey: "",
    geminiEncryptedKey: "",
    googleAnalyticsId: "",
    siteUrl: ""
  };
}

function readState(): CmsState {
  if (typeof window === "undefined") return createInitialState();

  const stored = window.localStorage.getItem(storageKey);
  if (!stored) return createInitialState();

  try {
    const parsed = JSON.parse(stored) as CmsState;
    return {
      ...createInitialState(),
      ...parsed,
      activeDraft: parsed.activeDraft ?? initialDraft,
      drafts: parsed.drafts ?? [],
      posts: parsed.posts ?? [],
      media: parsed.media ?? [],
      events: parsed.events ?? [],
      livePostUrl: parsed.livePostUrl ?? "",
      siteHomeUrl: parsed.siteHomeUrl ?? "",
      siteUrl: parsed.siteUrl ?? ""
    };
  } catch {
    return createInitialState();
  }
}

function readAuthSession(): AuthSession | undefined {
  if (typeof window === "undefined") return undefined;
  const stored = window.sessionStorage.getItem(authSessionKey);
  if (!stored) return undefined;

  try {
    const parsed = JSON.parse(stored) as AuthSession;
    return parsed.userToken ? parsed : undefined;
  } catch {
    window.sessionStorage.removeItem(authSessionKey);
    return undefined;
  }
}

function writeAuthSession(session: AuthSession | undefined) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.sessionStorage.removeItem(authSessionKey);
    return;
  }
  window.sessionStorage.setItem(authSessionKey, JSON.stringify(session));
}

function describeWorkerError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const payload = data as {
    readonly error?: unknown;
    readonly details?: unknown;
    readonly requiredPermissions?: unknown;
  };
  const base = typeof payload.error === "string" ? payload.error : fallback;
  const details = typeof payload.details === "string" ? payload.details : "";
  const permissions = Array.isArray(payload.requiredPermissions)
    ? payload.requiredPermissions.filter(
        (permission): permission is string => typeof permission === "string"
      )
    : [];
  return [
    base,
    details,
    permissions.length > 0 ? `Required permissions: ${permissions.join(", ")}` : ""
  ]
    .filter(Boolean)
    .join(". ");
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function createAuthNonce(): string {
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function describeAuthError(error: string, description?: string): string {
  if (error === "access_denied") return "GitHub connection cancelled";
  if (error === "missing_worker_secrets") return "GitHub authentication is not configured.";
  if (error === "missing_code") return "GitHub did not return an authorization code.";
  if (description) return description;
  return `GitHub connection failed: ${error}`;
}

function sanitizeCmsStateForStorage(state: CmsState): CmsState {
  const {
    // Drop legacy persisted token fields from older localStorage payloads.
    userToken: _userToken,
    accessToken: _accessToken,
    installationId: _installationId,
    ...safeState
  } = state as CmsState & {
    readonly userToken?: string;
    readonly accessToken?: string;
    readonly installationId?: string;
  };
  void _userToken;
  void _accessToken;
  void _installationId;
  return safeState;
}

export function App() {
  return (
    <BrowserRouter>
      <RouteSeo />
      <CmsApplication />
    </BrowserRouter>
  );
}

function CmsApplication() {
  const [state, setState] = React.useState<CmsState>(() => readState());
  const [authSession, setAuthSession] = React.useState<AuthSession | undefined>(() =>
    readAuthSession()
  );
  const [authMessage, setAuthMessage] = React.useState<string>("");
  const [repositoriesLoading, setRepositoriesLoading] = React.useState(false);
  const [status, setStatus] = React.useState("Ready");

  React.useEffect(() => {
    if (!status || status === "Ready") return;
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes("failed") || lowerStatus.includes("error")) return;
    if (
      lowerStatus.includes("connecting") ||
      lowerStatus.includes("fetching") ||
      lowerStatus.includes("generating")
    )
      return;

    const timer = setTimeout(() => setStatus("Ready"), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  React.useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(sanitizeCmsStateForStorage(state)));
  }, [state]);

  React.useEffect(() => {
    writeAuthSession(authSession);
  }, [authSession]);

  const activeGithubClient = React.useMemo(() => {
    return authSession?.accessToken && !isExpired(authSession.accessTokenExpiresAt)
      ? new GitHubClient(authSession.accessToken)
      : defaultLocalGithubClient;
  }, [authSession?.accessToken, authSession?.accessTokenExpiresAt]);

  const [appMetadata, setAppMetadata] = React.useState<AppMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = React.useState(true);

  React.useEffect(() => {
    const workerUrl = import.meta.env.VITE_GITHUB_AUTH_WORKER_URL;
    if (!workerUrl) {
      setMetadataLoading(false);
      setAuthMessage("Could not load GitHub App metadata");
      return;
    }

    fetch(`${workerUrl}/github/app/metadata`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Metadata request failed");
        const text = await res.text();
        try {
          return JSON.parse(text) as AppMetadata;
        } catch {
          throw new Error("Response is not valid JSON");
        }
      })
      .then((meta) => {
        setAppMetadata(meta);
        setAuthMessage("");
      })
      .catch((err: unknown) => {
        setAuthMessage("Could not load GitHub App metadata");
        if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
          console.warn(
            "Could not load GitHub App metadata:",
            (err as Error).message || String(err)
          );
        }
      })
      .finally(() => {
        setMetadataLoading(false);
      });
  }, []);

  React.useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    // Check hash for security, but fallback to query params for backward compatibility
    const installationId = hashParams.get("installation_id") || queryParams.get("installation_id");
    const userToken = hashParams.get("user_token") || queryParams.get("user_token");
    const errorMsg = hashParams.get("error") || queryParams.get("error");
    const errorDescription =
      hashParams.get("error_description") || queryParams.get("error_description") || undefined;
    const returnedState = hashParams.get("state") || queryParams.get("state");
    const setupAction = hashParams.get("setup_action") || queryParams.get("setup_action");

    if (errorMsg) {
      const message = describeAuthError(errorMsg, errorDescription);
      setAuthMessage(message);
      setStatus(message);
      addEvent("auth", `Auth error: ${message}`);
      window.sessionStorage.removeItem(pendingAuthStateKey);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (userToken) {
      const expectedState = window.sessionStorage.getItem(pendingAuthStateKey);
      if (!expectedState || returnedState !== expectedState) {
        setAuthMessage("GitHub session could not be verified.");
        setStatus("GitHub session could not be verified.");
        window.sessionStorage.removeItem(pendingAuthStateKey);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      const nextSession: AuthSession = {
        userToken,
        installationId: installationId || authSession?.installationId
      };
      setAuthSession(nextSession);
      window.sessionStorage.removeItem(pendingAuthStateKey);
      setAuthMessage("");
      setStatus("GitHub connected successfully!");
      addEvent("auth", `Authenticated user`);

      if (setupAction === "update") {
        // Automatically reload repositories if the user just updated their installation
        setStatus("Refreshing repositories...");
        setTimeout(() => loadRepositories(userToken), 500);
      }

      // Completely clear query string and hash from the URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, []);

  const [repoEntries, setRepoEntries] = React.useState<readonly RepositoryEntry[]>([]);

  React.useEffect(() => {
    if (!state.repository) {
      setRepoEntries([]);
      return;
    }

    activeGithubClient
      .getRepositoryEntries({
        owner: state.repository.owner,
        repo: state.repository.repo,
        branch: state.repository.branch
      })
      .then((entries) => {
        setRepoEntries(entries);
      })
      .catch((err: unknown) => {
        setStatus(`Failed to read repository layout: ${(err as Error).message}`);
      });
  }, [state.repository, activeGithubClient]);

  React.useEffect(() => {
    if (!state.repository) return;

    activeGithubClient
      .getFileContent(
        {
          owner: state.repository.owner,
          repo: state.repository.repo,
          branch: state.repository.branch
        },
        RepositoryLayout.seoConfig
      )
      .then((content) => {
        if (!content) return;
        const match = content.match(/googleAnalyticsId:\s*["']([^"']+)["']/);
        if (match && match[1]) {
          setState((curr) => ({ ...curr, googleAnalyticsId: match[1] }));
        }
      })
      .catch((err) => {
        console.warn("Could not read config/seo.ts on repository connect:", err);
      });
  }, [state.repository, activeGithubClient]);

  const seoInput = {
    title: state.activeDraft.title,
    description: state.activeDraft.description,
    canonicalBaseUrl: state.siteUrl || "https://example.com",
    slug: state.activeDraft.slug,
    coverImage: state.media.find((item) => item.kind === "cover")?.path
  };
  const seo = generateSeoMetadata(seoInput);
  const seoScore = scoreSeo(seoInput);
  const outline = extractOutline(state.activeDraft.markdown);
  const repositoryValidation = React.useMemo(() => {
    if (!state.repository) {
      return { ok: false, error: { message: "No repository connected", details: { missing: [] } } };
    }
    return validateRepositoryStructure(repoEntries);
  }, [state.repository, repoEntries]);

  const hasFrontend = React.useMemo(() => {
    return repoEntries.some(
      (e) =>
        e.path === "package.json" ||
        e.path === "astro.config.mjs" ||
        e.path === "index.html" ||
        e.path === "next.config.js"
    );
  }, [repoEntries]);

  const hasBlogRoute = React.useMemo(() => {
    return repoEntries.some((e) => e.path === "src/pages/blogs/[slug].astro");
  }, [repoEntries]);

  const hasDeployWorkflow = React.useMemo(() => {
    return repoEntries.some((e) => e.path === ".github/workflows/deploy.yml");
  }, [repoEntries]);

  const staticSiteReady = Boolean(state.repository && hasFrontend && hasBlogRoute && hasDeployWorkflow);

  React.useEffect(() => {
    if (!state.repository || !hasFrontend || !hasBlogRoute) return;

    activeGithubClient
      .getPagesSite(state.repository)
      .then((site) => {
        if (!site?.htmlUrl) return;
        setState((current) => ({
          ...current,
          siteHomeUrl: site.htmlUrl,
          siteUrl: current.siteUrl || site.htmlUrl
        }));
      })
      .catch((err: unknown) => {
        setStatus(`Repository needs Pages permission: ${(err as Error).message}`);
      });
  }, [state.repository, hasFrontend, hasBlogRoute, activeGithubClient]);

  async function initializeTemplate() {
    if (!state.repository) return;
    if (!authSession?.installationId) {
      setStatus("Repository access not granted");
      return;
    }
    setState((c) => ({ ...c, isInitializingTemplate: true }));
    setStatus("Setting up your static blog site...");
    try {
      const data = await requestInstallationToken(authSession.installationId, "pages-setup");
      const setupGithubClient = new GitHubClient(data.token);
      const result = await setupGithubClient.initializeAstroTemplate(state.repository);
      const site = await setupGithubClient.ensurePagesSite(state.repository);
      setState((current) => ({
        ...current,
        siteHomeUrl: site.htmlUrl,
        siteUrl: current.siteUrl || site.htmlUrl
      }));
      setStatus(`Static blog site ready at ${result.sha}`);
      addEvent("repository", "Initialized Astro template");

      const entries = await setupGithubClient.getRepositoryEntries(state.repository);
      setRepoEntries(entries);
    } catch (err: unknown) {
      setStatus(`Failed to initialize template: ${(err as Error).message}`);
    } finally {
      setState((c) => ({ ...c, isInitializingTemplate: false }));
    }
  }

  function addEvent(stage: string, message: string) {
    setState((current) => ({
      ...current,
      events: [
        { id: crypto.randomUUID(), stage, message, createdAt: new Date().toISOString() },
        ...current.events
      ].slice(0, 8)
    }));
  }

  async function loadRepositories(userToken = authSession?.userToken) {
    try {
      if (!userToken) throw new Error("Not authenticated");
      setRepositoriesLoading(true);
      setAuthMessage("");
      const repositories = await GitHubClient.listAvailableRepositories(userToken);
      setState((curr) => ({ ...curr, availableRepositories: repositories }));
      if (repositories.length === 0) {
        setAuthMessage("No repositories available. Configure GitHub App permissions.");
      }
    } catch (err: unknown) {
      const message = `Failed to load repositories: ${(err as Error).message}`;
      setAuthMessage(message);
      setStatus(message);
    } finally {
      setRepositoriesLoading(false);
    }
  }

  async function requestInstallationToken(
    installationId: number | string,
    purpose: "content" | "pages-setup" = "content"
  ): Promise<{
    readonly token: string;
    readonly expiresAt?: string;
  }> {
    if (!authSession?.userToken) throw new Error("Not authenticated");
    const workerUrl = import.meta.env.VITE_GITHUB_AUTH_WORKER_URL;
    if (!workerUrl) throw new Error("Could not load GitHub App metadata");

    const res = await fetch(`${workerUrl}/github/app/installation-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authSession.userToken}`
      },
      body: JSON.stringify({ installationId: Number(installationId), purpose })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(describeWorkerError(errData, "Failed to fetch installation token"));
    }
    return (await res.json()) as { token: string; expiresAt?: string };
  }

  async function selectRepository(repoId: number) {
    const repository = state.availableRepositories?.find((r) => r.id === repoId);
    if (!repository) return;

    setState((current) => ({
      ...current,
      repository: {
        owner: repository.fullName.split("/")[0] || "local",
        repo: repository.name,
        branch: repository.defaultBranch,
        fullName: repository.fullName
      }
    }));
    setStatus(`Connected ${repository.fullName}. Fetching access token...`);
    addEvent("repository", `Connected ${repository.fullName}`);

    if (repository.installationId && authSession?.userToken) {
      try {
        const data = await requestInstallationToken(repository.installationId);
        setAuthSession((current) =>
          current
            ? {
                ...current,
                accessToken: data.token,
                accessTokenExpiresAt: data.expiresAt,
                installationId: String(repository.installationId)
              }
            : current
        );
        setAuthMessage("");
        setStatus(`Ready to edit ${repository.fullName}`);
      } catch (err) {
        const message = `Failed to fetch access token: ${(err as Error).message}`;
        setAuthMessage(message);
        setStatus(message);
      }
    }
  }

  async function refreshAccessToken() {
    if (!authSession?.installationId) {
      setAuthMessage("Repository access not granted");
      return;
    }

    try {
      const data = await requestInstallationToken(authSession.installationId);
      setAuthSession((current) =>
        current
          ? {
              ...current,
              accessToken: data.token,
              accessTokenExpiresAt: data.expiresAt
            }
          : current
      );
      setAuthMessage("");
      setStatus("GitHub access refreshed.");
    } catch (err: unknown) {
      const message = `Failed to refresh access: ${(err as Error).message}`;
      setAuthMessage(message);
      setStatus(message);
    }
  }

  function disconnectRepository() {
    setAuthSession(undefined);
    setState((current) => ({
      ...current,
      repository: undefined,
      availableRepositories: undefined
    }));
    setAuthMessage("");
    setStatus("Disconnected GitHub");
  }

  function handleConnectGitHub() {
    if (appMetadata) {
      const nonce = createAuthNonce();
      window.sessionStorage.setItem(pendingAuthStateKey, nonce);
      setAuthMessage("");
      setStatus("Connecting to GitHub...");
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${appMetadata.clientId}&state=${encodeURIComponent(nonce)}`;
    } else {
      setAuthMessage("Could not load GitHub App metadata");
    }
  }

  function handleConfigureRepositories() {
    if (authSession?.installationId) {
      window.open(
        `https://github.com/settings/installations/${authSession.installationId}`,
        "_blank"
      );
    } else if (appMetadata) {
      window.open(appMetadata.htmlUrl, "_blank");
    }
  }

  function updateDraft(patch: Partial<DraftRecord>) {
    setState((current) => {
      const nextDraft = {
        ...current.activeDraft,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      return {
        ...current,
        activeDraft: nextDraft
      };
    });
  }

  function generateSlugFromTitle() {
    updateDraft({ slug: generateSlug(state.activeDraft.title) });
  }

  function addMedia(input: Omit<MediaRecord, "id" | "path">) {
    const planned = planMediaAsset(input);
    if (!planned.ok) {
      setStatus(planned.error.message);
      return;
    }

    setState((current) => ({
      ...current,
      media: [
        {
          ...input,
          id: crypto.randomUUID(),
          path: planned.value.location.path
        },
        ...current.media
      ]
    }));
    addEvent("media", `Planned ${planned.value.location.path}`);
  }

  async function ensureDecryptedKey(): Promise<string | null> {
    if (state.geminiApiKey) return state.geminiApiKey;
    if (!state.geminiEncryptedKey) return null;

    const passphrase = prompt("Enter your passphrase to decrypt your Gemini API Key:");
    if (!passphrase) return null;

    try {
      const decrypted = await decryptData(state.geminiEncryptedKey, passphrase);
      setState((curr) => ({ ...curr, geminiApiKey: decrypted }));
      return decrypted;
    } catch {
      alert("Incorrect passphrase. Failed to decrypt API key.");
      return null;
    }
  }

  async function handleSaveGeminiKey(key: string, passphrase?: string) {
    if (passphrase) {
      try {
        const encrypted = await encryptData(key, passphrase);
        setState((curr) => ({
          ...curr,
          geminiApiKey: key,
          geminiEncryptedKey: encrypted
        }));
        setStatus("Gemini API key encrypted and saved locally.");
      } catch (err: unknown) {
        alert(`Encryption failed: ${(err as Error).message}`);
      }
    } else {
      setState((curr) => ({
        ...curr,
        geminiApiKey: key,
        geminiEncryptedKey: ""
      }));
      setStatus("Gemini API key saved in memory for this session.");
    }
  }

  function handleClearGeminiKey() {
    setState((curr) => ({
      ...curr,
      geminiApiKey: "",
      geminiEncryptedKey: ""
    }));
    setStatus("Gemini API key cleared.");
  }

  async function createAiSuggestion(kind: AiSuggestionKind) {
    try {
      const apiKey = await ensureDecryptedKey();
      if (!apiKey) {
        setStatus("Please configure your Gemini API Key in Settings first.");
        addEvent("ai", "Suggestion aborted: API key missing");
        return;
      }

      setStatus(`Generating AI suggestion (${kind})...`);

      // Determine what text to analyze based on the kind
      let selectedText = state.activeDraft.description;
      if (kind === "fix-grammar" || kind === "rewrite") {
        selectedText = state.activeDraft.markdown; // Or ideally current editor selection if we wired that up
      }

      const suggestion = await generateGeminiSuggestion(
        {
          kind,
          selectedText,
          contextMarkdown: state.activeDraft.markdown
        },
        apiKey
      );

      setState((current) => ({ ...current, aiSuggestion: suggestion }));
      setStatus("AI suggestion prepared.");
      addEvent("ai", `AI suggestion prepared: ${kind}`);
    } catch (err: unknown) {
      setStatus(`AI suggestion failed: ${(err as Error).message}`);
      addEvent("ai", `AI suggestion failed: ${(err as Error).message}`);
    }
  }

  function approveAiSuggestion() {
    if (!state.aiSuggestion) return;

    let patch: Partial<DraftRecord> = {};
    const { kind, content } = state.aiSuggestion;

    switch (kind) {
      case "improve-writing":
      case "summarize":
      case "social-post":
        patch = { description: content };
        break;
      case "tags":
        patch = { tags: content };
        break;
      case "categories":
        patch = { categories: content };
        break;
      case "fix-grammar":
      case "rewrite":
        patch = { markdown: content };
        break;
    }

    updateDraft(patch);
    setState((current) => ({ ...current, aiSuggestion: undefined }));
    addEvent("ai", `AI suggestion approved: ${kind}`);
  }

  async function saveDraft() {
    if (!state.repository) {
      setStatus("Connect a repository before saving.");
      return;
    }

    const frontmatter = buildDraftFrontmatter(state.activeDraft);
    const plan = createDraftSavePlan({
      slug: state.activeDraft.slug,
      title: state.activeDraft.title,
      markdown: state.activeDraft.markdown,
      frontmatter
    });
    if (!plan.ok) {
      setStatus(plan.error.message);
      return;
    }

    const result = await activeGithubClient.executeCommit(
      manifestToCommitRequest(state.repository, plan.value.commit)
    );
    setState((current) => ({
      ...current,
      activeDraft: { ...current.activeDraft, savedSha: result.sha },
      drafts: upsertById(current.drafts, { ...current.activeDraft, savedSha: result.sha })
    }));
    setStatus(`Draft saved at ${result.sha}`);
    addEvent("draft", `Saved ${plan.value.draftPath}`);
  }

  function createLivePostUrl(siteHomeUrl: string, slug: string): string {
    return `${siteHomeUrl.replace(/\/$/, "")}/blogs/${generateSlug(slug)}/`;
  }

  async function verifyLiveUrl(url: string): Promise<boolean> {
    const workerUrl = import.meta.env.VITE_GITHUB_AUTH_WORKER_URL;
    if (!workerUrl) return true;

    const response = await fetch(`${workerUrl}/live-url/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { reachable?: boolean };
    return Boolean(data.reachable);
  }

  async function publishPost() {
    if (!state.repository) {
      setStatus("Connect a repository before publishing.");
      return;
    }

    if (!staticSiteReady) {
      setStatus("Set up your blog site before publishing.");
      return;
    }

    const plan = createPublishPlan({
      slug: state.activeDraft.slug,
      title: state.activeDraft.title,
      markdown: state.activeDraft.markdown,
      draftSlug: state.activeDraft.slug,
      hasRemoteDraft: !!state.activeDraft.savedSha,
      frontmatter: {
        ...buildDraftFrontmatter(state.activeDraft),
        description: state.activeDraft.description,
        slug: state.activeDraft.slug,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: state.activeDraft.author
      }
    });
    if (!plan.ok) {
      setStatus(plan.error.message);
      return;
    }

    const valid = validatePublishPlan(plan.value);
    if (!valid.ok) {
      setStatus(valid.error.message);
      return;
    }

    setState((c) => ({ ...c, publishProgress: "validating-site" }));
    setStatus("Validating static site setup...");

    let pagesSite: GitHubPagesSite;
    let pagesClient: typeof activeGithubClient;
    try {
      pagesClient =
        authSession?.installationId && authSession.userToken
          ? new GitHubClient(
              (await requestInstallationToken(authSession.installationId, "pages-setup")).token
            )
          : activeGithubClient;
      pagesSite = await pagesClient.ensurePagesSite(state.repository);
      setState((current) => ({
        ...current,
        siteHomeUrl: pagesSite.htmlUrl,
        siteUrl: current.siteUrl || pagesSite.htmlUrl
      }));
    } catch (err: unknown) {
      setState((c) => ({ ...c, publishProgress: "failed" }));
      setStatus(`Repository needs Pages permission: ${(err as Error).message}`);
      return;
    }

    setState((c) => ({ ...c, publishProgress: "creating-commit" }));
    setStatus("Committing blog to GitHub...");

    let result;
    try {
      result = await activeGithubClient.executeCommit(
        manifestToCommitRequest(state.repository, plan.value.commit)
      );
    } catch (err: unknown) {
      setState((c) => ({ ...c, publishProgress: "failed" }));
      setStatus(`Commit failed: ${(err as Error).message}`);
      return;
    }

    setState((current) => ({
      ...current,
      activeDraft: { ...current.activeDraft, publishedSha: result.sha },
      posts: upsertById(current.posts, { ...current.activeDraft, publishedSha: result.sha }),
      drafts: current.drafts.filter((draft) => draft.id !== current.activeDraft.id),
      publishProgress: "building"
    }));
    setStatus(`Committed at ${result.sha}. Waiting for deployment...`);
    addEvent("publish", "Committed blog markdown");

    for (let attempts = 0; attempts < 30; attempts++) {
      await new Promise((res) => setTimeout(res, 2000));

      try {
        const status = await activeGithubClient.getWorkflowStatusForCommit(
          state.repository,
          result.sha
        );
        if (status === "completed") {
          setState((c) => ({ ...c, publishProgress: "verifying-live-url" }));
          setStatus("Verifying live blog URL...");
          const livePostUrl = createLivePostUrl(pagesSite.htmlUrl, state.activeDraft.slug);
          const reachable = await verifyLiveUrl(livePostUrl);
          if (reachable) {
            setState((c) => ({
              ...c,
              publishProgress: "live",
              livePostUrl,
              siteHomeUrl: pagesSite.htmlUrl
            }));
            setStatus("Live blog verified.");
            addEvent("publish", "Live blog verified on GitHub Pages");
          } else {
            setState((c) => ({
              ...c,
              publishProgress: "failed",
              livePostUrl,
              siteHomeUrl: pagesSite.htmlUrl
            }));
            setStatus("Deployed, but live URL is not reachable yet.");
          }
          break;
        } else if (status === "failed") {
          setState((c) => ({ ...c, publishProgress: "failed" }));
          setStatus("GitHub Actions build failed. Check repository logs.");
          addEvent("publish", "Build failed");
          break;
        } else if (status === "in_progress") {
          setState((c) => ({ ...c, publishProgress: "deploying" }));
          setStatus("Deploying via GitHub Actions...");
        } else if (status === "queued") {
          setState((c) => ({ ...c, publishProgress: "building" }));
          setStatus("Waiting for GitHub Actions to start for this commit...");
        } else if (status === "not_found") {
          setState((c) => ({ ...c, publishProgress: "building" }));
          setStatus(
            attempts < 5
              ? "Waiting for GitHub Actions to register this commit..."
              : "No GitHub Actions run found for this commit yet. Check that .github/workflows/deploy.yml exists on the selected branch and repository Actions are enabled."
          );
        }
      } catch {
        setState((c) => ({ ...c, publishProgress: "failed" }));
        setStatus("Failed to read workflow status.");
        break;
      }
    }

    setState((c) =>
      c.publishProgress === "building" || c.publishProgress === "deploying"
        ? { ...c, publishProgress: "failed" }
        : c
    );
    setStatus((currentStatus) =>
      currentStatus === "Deploying via GitHub Actions..." ||
      currentStatus.includes("Waiting for deployment") ||
      currentStatus.includes("Waiting for GitHub Actions") ||
      currentStatus.includes("Waiting for GitHub Actions to register") ||
      currentStatus.includes("No GitHub Actions run found")
        ? "GitHub Actions did not create a deploy run for this commit. Check that .github/workflows/deploy.yml exists on the selected branch and that repository Actions are enabled."
        : currentStatus
    );
  }

  const localRecoveryAvailable = isLocalDraftNewer(
    {
      repositoryId: state.repository?.fullName ?? "local",
      draftPath: `${RepositoryLayout.drafts}/${state.activeDraft.slug}.md`,
      markdown: state.activeDraft.markdown,
      updatedAt: state.activeDraft.updatedAt
    },
    state.activeDraft.savedSha ? state.activeDraft.updatedAt : undefined
  );

  const authStatus: AuthStatus = React.useMemo(() => {
    if (!authSession?.userToken) return "signed-out";
    if (authSession.accessToken && isExpired(authSession.accessTokenExpiresAt)) return "expired";
    if (state.repository && authSession.accessToken) return "repo-connected";
    if (authMessage) return "error";
    if (metadataLoading) return "loading-metadata";
    if (repositoriesLoading) return "selecting-repo";
    if (state.availableRepositories) return "selecting-repo";
    return "authenticated";
  }, [
    authMessage,
    metadataLoading,
    authSession?.userToken,
    authSession?.accessToken,
    authSession?.accessTokenExpiresAt,
    state.repository,
    state.availableRepositories,
    repositoriesLoading
  ]);

  const isAuthenticated = Boolean(authSession?.userToken) && authStatus !== "expired";
  const repositoryConnected = authStatus === "repo-connected";

  const [dashboardSidebarCollapsed, setDashboardSidebarCollapsed] = React.useState(() =>
    readStoredBoolean(DASHBOARD_SIDEBAR_COLLAPSED_STORAGE_KEY, false)
  );
  const [dashboardSidebarWidth, setDashboardSidebarWidth] = React.useState(() =>
    clamp(
      readStoredNumber(DASHBOARD_SIDEBAR_WIDTH_STORAGE_KEY, DASHBOARD_SIDEBAR_WIDTH_DEFAULT),
      DASHBOARD_SIDEBAR_WIDTH_MIN,
      DASHBOARD_SIDEBAR_WIDTH_MAX
    )
  );
  const [dashboardActivityWidth, setDashboardActivityWidth] = React.useState(() =>
    clamp(
      readStoredNumber(DASHBOARD_ACTIVITY_WIDTH_STORAGE_KEY, DASHBOARD_ACTIVITY_WIDTH_DEFAULT),
      DASHBOARD_ACTIVITY_WIDTH_MIN,
      DASHBOARD_ACTIVITY_WIDTH_MAX
    )
  );
  const resizeSessionRef = React.useRef<{
    readonly kind: "sidebar" | "activity";
    readonly startX: number;
    readonly startWidth: number;
  } | null>(null);

  React.useEffect(() => {
    window.localStorage.setItem(DASHBOARD_SIDEBAR_COLLAPSED_STORAGE_KEY, String(dashboardSidebarCollapsed));
  }, [dashboardSidebarCollapsed]);

  React.useEffect(() => {
    window.localStorage.setItem(DASHBOARD_SIDEBAR_WIDTH_STORAGE_KEY, String(dashboardSidebarWidth));
  }, [dashboardSidebarWidth]);

  React.useEffect(() => {
    window.localStorage.setItem(DASHBOARD_ACTIVITY_WIDTH_STORAGE_KEY, String(dashboardActivityWidth));
  }, [dashboardActivityWidth]);

  const stopDashboardResize = React.useCallback(() => {
    resizeSessionRef.current = null;
    document.body.classList.remove("ilm-resizing-panels");
  }, []);

  const startDashboardResize = React.useCallback(
    (kind: "sidebar" | "activity", event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();

      if (kind === "sidebar" && dashboardSidebarCollapsed) {
        setDashboardSidebarCollapsed(false);
      }

      resizeSessionRef.current = {
        kind,
        startX: event.clientX,
        startWidth: kind === "sidebar" ? dashboardSidebarWidth : dashboardActivityWidth
      };

      document.body.classList.add("ilm-resizing-panels");

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const session = resizeSessionRef.current;
        if (!session || session.kind !== kind || pointerEvent.pointerId !== event.pointerId) return;

        if (kind === "sidebar") {
          const maximum = Math.max(
            DASHBOARD_SIDEBAR_WIDTH_MIN,
            Math.min(DASHBOARD_SIDEBAR_WIDTH_MAX, window.innerWidth - 640)
          );
          const nextWidth = clamp(
            session.startWidth + (pointerEvent.clientX - session.startX),
            DASHBOARD_SIDEBAR_WIDTH_MIN,
            maximum
          );
          setDashboardSidebarWidth(nextWidth);
        } else {
          const maximum = Math.max(
            DASHBOARD_ACTIVITY_WIDTH_MIN,
            Math.min(DASHBOARD_ACTIVITY_WIDTH_MAX, window.innerWidth - 560)
          );
          const nextWidth = clamp(
            session.startWidth - (pointerEvent.clientX - session.startX),
            DASHBOARD_ACTIVITY_WIDTH_MIN,
            maximum
          );
          setDashboardActivityWidth(nextWidth);
        }
      };

      const handlePointerUp = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== event.pointerId) return;

        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        stopDashboardResize();
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [dashboardActivityWidth, dashboardSidebarCollapsed, dashboardSidebarWidth, stopDashboardResize]
  );

  const dashboardSidebarWidthValue = dashboardSidebarCollapsed
    ? DASHBOARD_SIDEBAR_WIDTH_COLLAPSED
    : dashboardSidebarWidth;

  React.useEffect(() => {
    return () => stopDashboardResize();
  }, [stopDashboardResize]);

  React.useEffect(() => {
    if (authSession?.userToken && !state.repository && !state.availableRepositories) {
      loadRepositories(authSession.userToken);
    }
  }, [authSession?.userToken, state.repository, state.availableRepositories]);

  const location = useLocation();
  if (location.pathname === "/") {
    return <LandingPage onConnectGitHub={handleConnectGitHub} />;
  }
  if (location.pathname === "/docs") {
    return <DocsPage onConnectGitHub={handleConnectGitHub} />;
  }
  if (location.pathname === "/privacy") {
    return <PrivacyPage onConnectGitHub={handleConnectGitHub} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div
        className="grid min-h-screen grid-cols-1 lg:min-h-screen lg:[grid-template-columns:var(--ilm-dashboard-sidebar-width)_minmax(0,1fr)]"
        style={{
          ["--ilm-dashboard-sidebar-width" as string]: `${dashboardSidebarWidthValue}px`
        }}
      >
        <aside className="relative border-r border-zinc-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-white">
                Ilm
              </div>
              <div className={dashboardSidebarCollapsed ? "lg:sr-only" : ""}>
                <p className="text-sm font-semibold">Ilm</p>
                <p className="text-xs text-zinc-500">Git-native publishing</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden shrink-0 lg:inline-flex"
              onClick={() => setDashboardSidebarCollapsed((current) => !current)}
            >
              {dashboardSidebarCollapsed ? "Expand" : "Collapse"}
            </Button>
          </div>
          <nav aria-label="Primary" className="space-y-1 p-3">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                title={dashboardSidebarCollapsed ? item.label : undefined}
                aria-label={item.label}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    dashboardSidebarCollapsed ? "lg:justify-center lg:px-2" : "",
                    isActive ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-100"
                  ].join(" ")
                }
              >
                <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className={dashboardSidebarCollapsed ? "lg:sr-only" : ""}>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div
            className={[
              "border-t border-zinc-200 p-4 text-xs text-zinc-600",
              dashboardSidebarCollapsed ? "hidden lg:block" : ""
            ].join(" ")}
          >
            <p className="font-medium text-zinc-900">Repository</p>
            <p className="mt-1 break-words">{state.repository?.fullName ?? "Not connected"}</p>
          </div>
          <button
            type="button"
            aria-label="Resize sidebar"
            onPointerDown={(event) => startDashboardResize("sidebar", event)}
            className="absolute right-0 top-0 hidden h-full w-4 cursor-col-resize touch-none items-center justify-center border-l border-transparent text-zinc-300 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 lg:flex"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </aside>
        <main
          className="min-w-0 relative"
          style={{
            ["--ilm-dashboard-activity-width" as string]: `${dashboardActivityWidth}px`
          }}
        >
          {status && status !== "Ready" && (
            <div
              role="status"
              className="fixed bottom-6 right-6 z-50 rounded-lg bg-zinc-900 text-white px-4 py-3 text-sm shadow-2xl animate-fade-in-up max-w-md flex items-center gap-3 border border-zinc-800"
            >
              {status.toLowerCase().includes("failed") || status.toLowerCase().includes("error") ? (
                <AlertTriangle className="h-4 w-4 text-red-400" />
              ) : status.toLowerCase().includes("success") ||
                status.toLowerCase().includes("connected") ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-blue-400" />
              )}
              <span className="flex-1">{status}</span>
              <button
                onClick={() => setStatus("Ready")}
                className="text-zinc-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <span aria-hidden="true">x</span>
              </button>
            </div>
          )}
          <Routes>
            <Route
              path="/dashboard"
              element={
                <Dashboard
                  state={state}
                  status={status}
                  authStatus={authStatus}
                  authMessage={authMessage}
                  authSession={authSession}
                  appMetadataLoaded={Boolean(appMetadata)}
                  repositoriesLoading={repositoriesLoading}
                  seoScore={seoScore}
                  repositoryValid={repositoryValidation.ok}
                  onConnect={handleConnectGitHub}
                  onLoadRepositories={() => loadRepositories()}
                  onRefreshAccess={refreshAccessToken}
                  onSelectRepository={selectRepository}
                  onDisconnectRepository={disconnectRepository}
                  onConfigureRepositories={handleConfigureRepositories}
                  dashboardActivityWidth={dashboardActivityWidth}
                  onActivityResizeStart={(event) => startDashboardResize("activity", event)}
                />
              }
            />
            <Route
              path="/editor"
              element={
                repositoryConnected ? (
                  <EditorPage
                    draft={state.activeDraft}
                    seoScore={seoScore}
                    seoMetadata={seo}
                    outline={outline}
                    readingTime={estimateReadingTimeMinutes(state.activeDraft.markdown)}
                    aiSuggestion={state.aiSuggestion}
                    publishProgress={state.publishProgress}
                    localRecoveryAvailable={localRecoveryAvailable}
                    connected={repositoryConnected}
                    staticSiteReady={staticSiteReady}
                    isInitializingTemplate={state.isInitializingTemplate}
                    livePostUrl={state.livePostUrl}
                    siteHomeUrl={state.siteHomeUrl}
                    onInitializeTemplate={initializeTemplate}
                    onChange={updateDraft}
                    onGenerateSlug={generateSlugFromTitle}
                    onSuggest={createAiSuggestion}
                    onApproveSuggestion={approveAiSuggestion}
                    onSaveDraft={saveDraft}
                    onPublish={publishPost}
                    onAddMedia={addMedia}
                  />
                ) : (
                  <AuthRequiredPage
                    pageName="Editor"
                    authStatus={authStatus}
                    authMessage={authMessage}
                    onConnect={handleConnectGitHub}
                    onConfigureRepositories={handleConfigureRepositories}
                    onRefreshAccess={refreshAccessToken}
                  />
                )
              }
            />
            <Route
              path="/posts"
              element={<Navigate to="/blogs" replace />}
            />
            <Route
              path="/blogs"
              element={
                repositoryConnected ? (
                  <ListPage title="Blogs" items={state.posts} connected={repositoryConnected} />
                ) : (
                  <AuthRequiredPage
                    pageName="Blogs"
                    authStatus={authStatus}
                    authMessage={authMessage}
                    onConnect={handleConnectGitHub}
                    onConfigureRepositories={handleConfigureRepositories}
                    onRefreshAccess={refreshAccessToken}
                  />
                )
              }
            />
            <Route
              path="/drafts"
              element={
                repositoryConnected ? (
                  <ListPage title="Drafts" items={state.drafts} connected={repositoryConnected} />
                ) : (
                  <AuthRequiredPage
                    pageName="Drafts"
                    authStatus={authStatus}
                    authMessage={authMessage}
                    onConnect={handleConnectGitHub}
                    onConfigureRepositories={handleConfigureRepositories}
                    onRefreshAccess={refreshAccessToken}
                  />
                )
              }
            />
            <Route
              path="/media"
              element={
                repositoryConnected ? (
                  <MediaPage media={state.media} onAdd={addMedia} connected={repositoryConnected} />
                ) : (
                  <AuthRequiredPage
                    pageName="Media"
                    authStatus={authStatus}
                    authMessage={authMessage}
                    onConnect={handleConnectGitHub}
                    onConfigureRepositories={handleConfigureRepositories}
                    onRefreshAccess={refreshAccessToken}
                  />
                )
              }
            />
            <Route
              path="/search"
              element={
                repositoryConnected ? (
                  <SearchPage
                    posts={state.posts}
                    drafts={state.drafts}
                    connected={repositoryConnected}
                  />
                ) : (
                  <AuthRequiredPage
                    pageName="Search"
                    authStatus={authStatus}
                    authMessage={authMessage}
                    onConnect={handleConnectGitHub}
                    onConfigureRepositories={handleConfigureRepositories}
                    onRefreshAccess={refreshAccessToken}
                  />
                )
              }
            />
            <Route
              path="/analytics"
              element={
                repositoryConnected ? (
                  <AnalyticsPage />
                ) : (
                  <AuthRequiredPage
                    pageName="Analytics"
                    authStatus={authStatus}
                    authMessage={authMessage}
                    onConnect={handleConnectGitHub}
                    onConfigureRepositories={handleConfigureRepositories}
                    onRefreshAccess={refreshAccessToken}
                  />
                )
              }
            />
            <Route
              path="/settings"
              element={
                isAuthenticated ? (
                  <SettingsPage
                    repository={state.repository}
                    geminiApiKey={state.geminiApiKey || ""}
                    geminiEncrypted={Boolean(state.geminiEncryptedKey)}
                    googleAnalyticsId={state.googleAnalyticsId}
                    siteUrl={state.siteUrl}
                    hasFrontend={hasFrontend}
                    isInitializingTemplate={state.isInitializingTemplate}
                    onSaveGeminiKey={handleSaveGeminiKey}
                    onClearGeminiKey={handleClearGeminiKey}
                    onSaveSiteUrl={(url) => setState((curr) => ({ ...curr, siteUrl: url }))}
                    onInitializeTemplate={initializeTemplate}
                  />
                ) : (
                  <AuthRequiredPage
                    pageName="Settings"
                    authStatus={authStatus}
                    authMessage={authMessage}
                    onConnect={handleConnectGitHub}
                    onConfigureRepositories={handleConfigureRepositories}
                    onRefreshAccess={refreshAccessToken}
                  />
                )
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function PageHeader({
  title,
  description
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <header className="border-b border-zinc-200 bg-white px-6 py-5">
      <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-zinc-600">{description}</p>
    </header>
  );
}

function Dashboard({
  state,
  status,
  authStatus,
  authMessage,
  authSession,
  appMetadataLoaded,
  repositoriesLoading,
  seoScore,
  repositoryValid,
  onConnect,
  onLoadRepositories,
  onRefreshAccess,
  onSelectRepository,
  onDisconnectRepository,
  onConfigureRepositories,
  dashboardActivityWidth,
  onActivityResizeStart
}: {
  readonly state: CmsState;
  readonly status: string;
  readonly authStatus: AuthStatus;
  readonly authMessage: string;
  readonly authSession?: AuthSession;
  readonly appMetadataLoaded: boolean;
  readonly repositoriesLoading: boolean;
  readonly seoScore: number;
  readonly repositoryValid: boolean;
  readonly onConnect: () => void;
  readonly onLoadRepositories: () => void;
  readonly onRefreshAccess: () => void;
  readonly onSelectRepository: (repoId: number) => void;
  readonly onDisconnectRepository: () => void;
  readonly onConfigureRepositories: () => void;
  readonly dashboardActivityWidth: number;
  readonly onActivityResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Connect a user-owned GitHub repository, continue writing, and monitor publishing status."
      />
      <section className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          title="Repository"
          value={state.repository?.fullName ?? "Not connected"}
          icon={<FolderGit2 />}
          loading={!state.repository && status.includes("Connecting")}
        />
        <StatusCard
          title="Structure"
          value={
            !state.repository
              ? "Not connected"
              : repositoryValid
                ? "Valid template"
                : "Needs review"
          }
          icon={<CheckCircle2 />}
          loading={!state.repository && status.includes("Connecting")}
        />
        <StatusCard
          title="SEO score"
          value={!state.repository ? "N/A" : `${seoScore}/100`}
          icon={<Search />}
          loading={!state.repository && status.includes("Connecting")}
        />
        <StatusCard
          title="Last status"
          value={!state.repository && status === "Ready" ? "Waiting" : status}
          icon={<UploadCloud />}
        />
      </section>
      <section
        className="grid gap-4 px-6 pb-6 lg:[grid-template-columns:minmax(0,1fr)_12px_var(--ilm-dashboard-activity-width)]"
        style={{ ["--ilm-dashboard-activity-width" as string]: `${dashboardActivityWidth}px` }}
      >
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Publishing activity</h2>
          <div className="mt-4 space-y-3">
            {state.events.length === 0 ? (
              <p className="text-sm text-zinc-600">No publishing events yet.</p>
            ) : (
              state.events.map((event) => (
                <div key={event.id} className="rounded-md border border-zinc-200 p-3">
                  <p className="text-sm font-medium">{event.message}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {event.stage} · {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label="Resize activity panel"
          onPointerDown={onActivityResizeStart}
          className="hidden h-full w-3 cursor-col-resize touch-none items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-300 hover:text-zinc-950 lg:flex"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <AuthSetupPanel
          authStatus={authStatus}
          authMessage={authMessage}
          authSession={authSession}
          appMetadataLoaded={appMetadataLoaded}
          repositories={state.availableRepositories}
          repository={state.repository}
          repositoriesLoading={repositoriesLoading}
          onConnect={onConnect}
          onLoadRepositories={onLoadRepositories}
          onSelectRepository={onSelectRepository}
          onRefreshAccess={onRefreshAccess}
          onDisconnectRepository={onDisconnectRepository}
          onConfigureRepositories={onConfigureRepositories}
          />
        </div>
      </section>
    </>
  );
}

function AuthSetupPanel({
  authStatus,
  authMessage,
  authSession,
  appMetadataLoaded,
  repositories,
  repository,
  repositoriesLoading,
  onConnect,
  onLoadRepositories,
  onSelectRepository,
  onRefreshAccess,
  onDisconnectRepository,
  onConfigureRepositories
}: {
  readonly authStatus: AuthStatus;
  readonly authMessage: string;
  readonly authSession?: AuthSession;
  readonly appMetadataLoaded: boolean;
  readonly repositories?: readonly GitHubRepositorySummary[];
  readonly repository?: ConnectedRepository;
  readonly repositoriesLoading: boolean;
  readonly onConnect: () => void;
  readonly onLoadRepositories: () => void;
  readonly onSelectRepository: (repoId: number) => void;
  readonly onRefreshAccess: () => void;
  readonly onDisconnectRepository: () => void;
  readonly onConfigureRepositories: () => void;
}) {
  const expiryLabel = authSession?.accessTokenExpiresAt
    ? new Date(authSession.accessTokenExpiresAt).toLocaleString()
    : "Session-only";

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="bg-slate-950 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-400 text-slate-950">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Connect GitHub</h2>
            <p className="text-sm text-slate-300">
              Connect GitHub → Select Repository → Ready to Publish
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[170px_1fr]">
        <ol className="space-y-4 border-b border-slate-200 bg-slate-50 p-5 lg:border-b-0 lg:border-r">
          <SetupStep
            icon={<KeyRound className="h-4 w-4" />}
            label="GitHub"
            active={!authSession}
            complete={Boolean(authSession)}
          />
          <SetupStep
            icon={<FolderGit2 className="h-4 w-4" />}
            label="Repository"
            active={Boolean(authSession) && !repository}
            complete={Boolean(repository)}
          />
          <SetupStep
            icon={<GitBranch className="h-4 w-4" />}
            label="Publish"
            active={Boolean(repository)}
            complete={authStatus === "repo-connected"}
          />
        </ol>

        <div className="p-5">
          {authMessage && (
            <div className="mb-4 flex gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
              <span>{authMessage}</span>
            </div>
          )}

          {authStatus === "loading-metadata" ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">Preparing GitHub connection...</p>
              <p className="mt-1 text-sm text-slate-600">
                Loading GitHub App details for a repository-scoped connection.
              </p>
            </div>
          ) : authStatus === "expired" ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Session expired. Reconnect to continue.
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Your GitHub installation token is no longer active. Refresh access to keep working.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={onRefreshAccess}>
                  <RefreshCw className="h-4 w-4" /> Refresh access
                </Button>
                <Button type="button" variant="ghost" onClick={onConnect}>
                  Reconnect GitHub
                </Button>
              </div>
            </div>
          ) : repository ? (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-950">
                  Connected to {repository.fullName}
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <Metric label="Branch" value={repository.branch} />
                  <Metric label="Access" value={expiryLabel} />
                </dl>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onRefreshAccess} variant="secondary">
                  <RefreshCw className="h-4 w-4" /> Refresh access
                </Button>
                <Button type="button" variant="ghost" onClick={onDisconnectRepository}>
                  Change repository
                </Button>
              </div>
            </div>
          ) : authSession ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Choose a repository...</p>
                <p className="mt-1 text-sm text-slate-600">
                  Ilm only shows repositories granted to the GitHub App installation.
                </p>
              </div>
              {repositoriesLoading ? (
                <div className="h-11 animate-pulse rounded-md bg-slate-100" />
              ) : repositories && repositories.length > 0 ? (
                <select
                  aria-label="Select repository"
                  className="cursor-pointer"
                  onChange={(e) => {
                    const repoId = Number(e.target.value);
                    if (repoId) onSelectRepository(repoId);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose a repository...
                  </option>
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.fullName}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  No repositories available. Configure GitHub App permissions.
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={onLoadRepositories}>
                  <RefreshCw className="h-4 w-4" /> Retry repositories
                </Button>
                <Button type="button" variant="ghost" onClick={onConfigureRepositories}>
                  Configure GitHub App
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Authenticate with GitHub to unlock your workspace.
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Ilm requests repository-scoped access through your GitHub App installation.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={onConnect} disabled={!appMetadataLoaded}>
                  <KeyRound className="h-4 w-4" />
                  Connect GitHub
                </Button>
                <Button type="button" variant="ghost" onClick={onConfigureRepositories}>
                  Configure GitHub App
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SetupStep({
  icon,
  label,
  active,
  complete
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly active: boolean;
  readonly complete: boolean;
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        className={[
          "flex h-8 w-8 items-center justify-center rounded-md border",
          complete
            ? "border-emerald-300 bg-emerald-100 text-emerald-700"
            : active
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-500"
        ].join(" ")}
      >
        {complete ? <CheckCircle2 className="h-4 w-4" /> : icon}
      </span>
      <span className={active || complete ? "font-medium text-slate-950" : "text-slate-500"}>
        {label}
      </span>
    </li>
  );
}

function AuthRequiredPage({
  pageName,
  authStatus,
  authMessage,
  onConnect,
  onConfigureRepositories,
  onRefreshAccess
}: {
  readonly pageName: string;
  readonly authStatus: AuthStatus;
  readonly authMessage: string;
  readonly onConnect: () => void;
  readonly onConfigureRepositories: () => void;
  readonly onRefreshAccess: () => void;
}) {
  const expired = authStatus === "expired";

  return (
    <>
      <PageHeader title={pageName} description={`Authenticate before opening ${pageName}.`} />
      <section className="p-6">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-950 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-400 text-slate-950">
                {expired ? <RefreshCw className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-xl font-semibold">Connect GitHub</h2>
                <p className="text-sm text-slate-300">
                  Connect GitHub → Select Repository → Ready to Publish
                </p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {authMessage && (
              <div className="mb-4 flex gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <span>{authMessage}</span>
              </div>
            )}
            <p className="text-sm font-semibold text-slate-900">
              {expired
                ? "Session expired. Reconnect to continue."
                : `Authenticate before opening ${pageName}.`}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Ilm keeps repository access scoped to your GitHub App installation and stores tokens
              only for this browser session.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {expired ? (
                <Button type="button" onClick={onRefreshAccess}>
                  <RefreshCw className="h-4 w-4" /> Refresh access
                </Button>
              ) : (
                <Button type="button" onClick={onConnect}>
                  <KeyRound className="h-4 w-4" /> Connect GitHub
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onConfigureRepositories}>
                Configure GitHub App
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditorToolbar({ editor }: { readonly editor: any }) {
  if (!editor) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1.5">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`rounded-md p-1.5 hover:bg-zinc-200 ${editor.isActive("bold") ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`rounded-md p-1.5 hover:bg-zinc-200 ${editor.isActive("italic") ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-zinc-300" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`rounded-md p-1.5 hover:bg-zinc-200 ${editor.isActive("heading", { level: 1 }) ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`rounded-md p-1.5 hover:bg-zinc-200 ${editor.isActive("heading", { level: 2 }) ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`rounded-md p-1.5 hover:bg-zinc-200 ${editor.isActive("heading", { level: 3 }) ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-zinc-300" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`rounded-md p-1.5 hover:bg-zinc-200 ${editor.isActive("bulletList") ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`rounded-md p-1.5 hover:bg-zinc-200 ${editor.isActive("orderedList") ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
        title="Ordered List"
      >
        <ListOrdered className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-zinc-300" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`rounded-md p-1.5 hover:bg-zinc-200 ${editor.isActive("blockquote") ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
        title="Quote"
      >
        <Quote className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`rounded-md p-1.5 hover:bg-zinc-200 ${editor.isActive("code") ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
        title="Code"
      >
        <Code className="h-4 w-4" />
      </button>
    </div>
  );
}

function EditorPage({
  draft,
  seoScore,
  seoMetadata,
  outline,
  readingTime,
  aiSuggestion,
  publishProgress,
  localRecoveryAvailable,
  staticSiteReady,
  isInitializingTemplate,
  livePostUrl,
  siteHomeUrl,
  onInitializeTemplate,
  onChange,
  onGenerateSlug,
  onSuggest,
  onApproveSuggestion,
  onSaveDraft,
  onPublish,
  onAddMedia,
  connected
}: {
  readonly draft: DraftRecord;
  readonly seoScore: number;
  readonly seoMetadata: ReturnType<typeof generateSeoMetadata>;
  readonly outline: readonly {
    readonly level: number;
    readonly title: string;
    readonly anchor: string;
  }[];
  readonly readingTime: number;
  readonly aiSuggestion?: AiSuggestion;
  readonly publishProgress?: PublishProgressStage;
  readonly localRecoveryAvailable: boolean;
  readonly connected: boolean;
  readonly staticSiteReady: boolean;
  readonly isInitializingTemplate?: boolean;
  readonly livePostUrl?: string;
  readonly siteHomeUrl?: string;
  readonly onInitializeTemplate: () => void;
  readonly onChange: (patch: Partial<DraftRecord>) => void;
  readonly onGenerateSlug: () => void;
  readonly onSuggest: (kind: AiSuggestionKind) => void;
  readonly onApproveSuggestion: () => void;
  readonly onSaveDraft: () => void;
  readonly onPublish: () => void;
  readonly onAddMedia: (media: Omit<MediaRecord, "id">) => void;
}) {
  const postDestinationUrl = siteHomeUrl
    ? `${siteHomeUrl.replace(/\/$/, "")}/blogs/${draft.slug}/`
    : "";
  const publishDisabled =
    !connected ||
    !staticSiteReady ||
    publishProgress === "validating-site" ||
    publishProgress === "creating-commit" ||
    publishProgress === "deploying" ||
    publishProgress === "building" ||
    publishProgress === "verifying-live-url";
  const publishLabel = !connected
    ? "Connect repo to publish"
    : !staticSiteReady
      ? "Set up site to publish"
      : publishProgress === "validating-site"
        ? "Validating site..."
        : publishProgress === "creating-commit"
          ? "Committing..."
          : publishProgress === "building" || publishProgress === "deploying"
            ? "Deploying..."
            : publishProgress === "verifying-live-url"
              ? "Verifying live URL..."
              : publishProgress === "live" || publishProgress === "published"
                ? "Live!"
                : `Publish ${seoScore < 50 ? "(Low SEO)" : ""}`;

  const editor = useEditor({
    extensions: defaultEditorExtensions,
    content: draft.markdown,
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange({ markdown: (editor.storage as any).markdown.getMarkdown() });
    }
  });

  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (editor && draft.markdown !== (editor.storage as any).markdown.getMarkdown()) {
      editor.commands.setContent(draft.markdown);
    }
  }, [draft.markdown, editor]);

  React.useEffect(() => {
    async function handleUpload(e: Event) {
      const customEvent = e as CustomEvent<{ file: File; pos: number }>;
      const { file, pos } = customEvent.detail;

      try {
        const webpBlob = await convertImageToWebP(file);
        const fileName = `${Date.now()}-${file.name.replace(/\.[^/.]+$/, "")}.webp`;

        const plan = planMediaAsset({
          kind: "image",
          fileName,
          mimeType: "image/webp",
          sizeBytes: webpBlob.size,
          alt: file.name
        });

        if (!plan.ok) return;

        // Read base64
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          onAddMedia({
            ...plan.value,
            path: plan.value.location.path,
            contentBase64: base64,
            caption: "",
            alt: plan.value.alt ?? ""
          });

          // Insert into editor
          if (editor) {
            const objectUrl = URL.createObjectURL(webpBlob);
            editor
              .chain()
              .focus()
              .insertContentAt(pos, {
                type: "image",
                attrs: { src: objectUrl, alt: plan.value.alt }
              })
              .run();
          }
        };
        reader.readAsDataURL(webpBlob);
      } catch (err) {
        console.error("Failed to process image", err);
      }
    }

    window.addEventListener("ilm:upload-image", handleUpload);
    return () => window.removeEventListener("ilm:upload-image", handleUpload);
  }, [editor, onAddMedia]);

  return (
    <>
      <PageHeader
        title="Editor"
        description="Write rich content, validate metadata, and publish through GitHub commits."
      />
      <section className="grid gap-4 p-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title="Blog details">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title">
                <input
                  value={draft.title}
                  onChange={(event) => onChange({ title: event.target.value })}
                />
              </Field>
              <Field label="Slug">
                <div className="flex gap-2">
                  <input
                    value={draft.slug}
                    onChange={(event) => onChange({ slug: event.target.value })}
                  />
                  <Button type="button" variant="secondary" onClick={onGenerateSlug}>
                    Generate
                  </Button>
                </div>
              </Field>
              <Field label="Author">
                <input
                  value={draft.author}
                  onChange={(event) => onChange({ author: event.target.value })}
                />
              </Field>
              <Field label="Tags">
                <input
                  value={draft.tags}
                  onChange={(event) => onChange({ tags: event.target.value })}
                />
              </Field>
              <Field label="Categories">
                <input
                  value={draft.categories}
                  onChange={(event) => onChange({ categories: event.target.value })}
                />
              </Field>
              <Field label="Meta Description">
                <input
                  value={draft.description}
                  onChange={(event) => onChange({ description: event.target.value })}
                />
              </Field>
            </div>
          </Panel>
          {!staticSiteReady && (
            <Panel title="Set Up Blog Site">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <UploadCloud className="mt-0.5 h-5 w-5 text-blue-700" />
                  <div>
                    <h2 className="text-sm font-semibold text-blue-950">Set Up Blog Site</h2>
                    <p className="mt-1 text-sm text-blue-800">
                      This repository needs the Astro blog files and GitHub Pages workflow before a
                      blog can go live.
                    </p>
                    <Button
                      type="button"
                      className="mt-4"
                      onClick={onInitializeTemplate}
                      disabled={isInitializingTemplate}
                    >
                      {isInitializingTemplate ? "Setting up..." : "Set Up Blog Site"}
                    </Button>
                  </div>
                </div>
              </div>
            </Panel>
          )}
          <Panel title="Markdown editor">
            <EditorToolbar editor={editor} />
            <EditorContent
              editor={editor}
              className="min-h-[420px] w-full rounded-md border border-zinc-300 bg-white p-4 text-sm leading-6 focus-within:border-zinc-950 focus-within:ring-2 focus-within:ring-zinc-200"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" onClick={onSaveDraft} disabled={!connected}>
                {!connected ? "Connect repo to save" : "Save Draft"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onPublish}
                disabled={publishDisabled}
                title={
                  !connected
                    ? "Connect repository first"
                    : !staticSiteReady
                      ? "Set up the static blog site first"
                      : seoScore < 50
                        ? "Warning: Low SEO score"
                        : "Ready to publish"
                }
              >
                {publishLabel}
              </Button>
              {(publishProgress === "live" || publishProgress === "published") && livePostUrl && (
                <Button
                  type="button"
                  onClick={() => window.open(livePostUrl, "_blank")}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  View Live Blog <Sparkles className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </Panel>
        </div>
        <aside className="space-y-4">
          <Panel title="Static site">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-600">Status</span>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    staticSiteReady
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {staticSiteReady ? "Ready to publish" : "Setup required"}
                </span>
              </div>
              {siteHomeUrl && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Site home
                  </p>
                  <a
                    href={siteHomeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block break-words text-blue-700 hover:underline"
                  >
                    {siteHomeUrl}
                  </a>
                </div>
              )}
              {staticSiteReady && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onInitializeTemplate}
                  disabled={isInitializingTemplate}
                >
                  {isInitializingTemplate ? "Repairing setup..." : "Repair setup files"}
                </Button>
              )}
              {(livePostUrl || postDestinationUrl) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Live blog URL
                  </p>
                  <a
                    href={livePostUrl || postDestinationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block break-words text-blue-700 hover:underline"
                  >
                    {livePostUrl || postDestinationUrl}
                  </a>
                </div>
              )}
            </div>
          </Panel>
          <Panel title="AI Assistant">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSuggest("improve-writing")}
                className="h-auto py-2 text-xs"
              >
                <Sparkles className="mr-1 h-3 w-3" /> Improve
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSuggest("fix-grammar")}
                className="h-auto py-2 text-xs"
              >
                <Sparkles className="mr-1 h-3 w-3" /> Grammar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSuggest("rewrite")}
                className="h-auto py-2 text-xs"
              >
                <Sparkles className="mr-1 h-3 w-3" /> Rewrite
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSuggest("summarize")}
                className="h-auto py-2 text-xs"
              >
                <Sparkles className="mr-1 h-3 w-3" /> Summarize
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSuggest("tags")}
                className="h-auto py-2 text-xs"
              >
                <Sparkles className="mr-1 h-3 w-3" /> Tags
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSuggest("categories")}
                className="h-auto py-2 text-xs"
              >
                <Sparkles className="mr-1 h-3 w-3" /> Categories
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSuggest("social-post")}
                className="col-span-2 h-auto py-2 text-xs"
              >
                <Sparkles className="mr-1 h-3 w-3" /> Social Post
              </Button>
            </div>

            {aiSuggestion && (
              <div className="mt-4 rounded-md border border-zinc-200 bg-blue-50 p-3">
                <p className="mb-2 text-xs font-semibold text-blue-900">
                  Suggestion ({aiSuggestion.kind})
                </p>
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-blue-800">
                  {aiSuggestion.content}
                </div>
                <div className="mt-3 text-right">
                  <Button type="button" onClick={onApproveSuggestion} className="h-7 text-xs">
                    Approve
                  </Button>
                </div>
              </div>
            )}
          </Panel>
          <Panel title="SEO & Social">
            <div className="flex items-center gap-4">
              <div>
                <p
                  className={`text-3xl font-semibold ${seoScore >= 80 ? "text-green-600" : seoScore >= 50 ? "text-yellow-600" : "text-red-600"}`}
                >
                  {seoScore}/100
                </p>
                <p className="text-xs text-zinc-500">SEO Score</p>
              </div>
              {seoScore < 50 && (
                <p className="text-xs text-red-600">
                  Consider improving your title length, description, or adding a cover image.
                </p>
              )}
            </div>

            <div className="mt-4 border-t border-zinc-200 pt-4">
              <p className="mb-2 text-sm font-semibold">OpenGraph Preview</p>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                <p className="truncate">
                  <strong>Title:</strong> {seoMetadata.openGraph["og:title"]}
                </p>
                <p className="truncate">
                  <strong>Desc:</strong> {seoMetadata.openGraph["og:description"] || "None"}
                </p>
                <p className="truncate">
                  <strong>Image:</strong> {seoMetadata.openGraph["og:image"] || "None"}
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-zinc-200 pt-4">
              <p className="mb-2 text-sm font-semibold">Twitter Card</p>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                <p className="truncate">
                  <strong>Type:</strong> {seoMetadata.twitter["twitter:card"]}
                </p>
                <p className="truncate">
                  <strong>Title:</strong> {seoMetadata.twitter["twitter:title"]}
                </p>
                <p className="truncate">
                  <strong>Desc:</strong> {seoMetadata.twitter["twitter:description"] || "None"}
                </p>
              </div>
            </div>

            <p className="mt-4 break-words text-xs text-zinc-500">
              Canonical URL: {seoMetadata.canonicalUrl}
            </p>
          </Panel>
          <Panel title="Document">
            <dl className="space-y-2 text-sm">
              <Metric label="Reading time" value={`${readingTime} min`} />
              <Metric
                label="Local recovery"
                value={localRecoveryAvailable ? "Available" : "Synced"}
              />
              <Metric label="Saved commit" value={draft.savedSha ?? "Not saved"} />
              <Metric label="Published commit" value={draft.publishedSha ?? "Not published"} />
            </dl>
          </Panel>
          <Panel title="Outline">
            {outline.length === 0 ? (
              <p className="text-sm text-zinc-600">No headings found.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {outline.map((item) => (
                  <li key={item.anchor} className={item.level > 1 ? "pl-4 text-zinc-600" : ""}>
                    {item.title}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </aside>
      </section>
    </>
  );
}

function MediaPage({
  media,
  onAdd,
  connected
}: {
  readonly media: readonly MediaRecord[];
  readonly onAdd: (input: Omit<MediaRecord, "id" | "path">) => void;
  readonly connected: boolean;
}) {
  const [fileName, setFileName] = React.useState("cover.webp");
  const [alt, setAlt] = React.useState("Cover image");

  return (
    <>
      <PageHeader
        title="Media"
        description="Upload images, covers, and attachments for your repository."
      />
      <section className="grid gap-4 p-6 lg:grid-cols-[360px_1fr]">
        <Panel title="Add media">
          <div className="space-y-3">
            <Field label="File name">
              <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
            </Field>
            <Field label="Alt text">
              <input value={alt} onChange={(event) => setAlt(event.target.value)} />
            </Field>
            <Button
              type="button"
              disabled={!connected}
              onClick={() =>
                onAdd({
                  fileName,
                  kind: "cover",
                  mimeType: "image/webp",
                  sizeBytes: 120_000,
                  alt,
                  caption: ""
                })
              }
            >
              Add Media
            </Button>
          </div>
        </Panel>
        <Panel title="Library">
          <div className="grid gap-3 md:grid-cols-2">
            {media.length === 0 ? (
              <p className="text-sm text-zinc-600">
                {!connected ? "Repository not connected." : "No media uploaded yet."}
              </p>
            ) : (
              media.map((item) => (
                <div key={item.id} className="rounded-md border border-zinc-200 p-3">
                  <p className="font-medium">{item.fileName}</p>
                  <p className="mt-1 text-sm text-zinc-600">{item.path}</p>
                  <p className="mt-1 text-xs text-zinc-500">{item.alt}</p>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>
    </>
  );
}

function ListPage({
  title,
  items,
  connected
}: {
  readonly title: string;
  readonly items: readonly DraftRecord[];
  readonly connected: boolean;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={`${title} written through Ilm and stored in the selected repository.`}
      />
      <section className="grid gap-3 p-6 lg:grid-cols-2">
        {items.length === 0 ? (
          <EmptyState
            title={!connected ? "Repository not connected" : `No ${title.toLowerCase()} yet`}
            description={
              !connected
                ? "Connect to GitHub to view content."
                : "Use the editor to create content."
            }
          />
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-md border border-zinc-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-zinc-600">{item.description}</p>
              <p className="mt-3 text-xs text-zinc-500">{item.slug}</p>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function SearchPage({
  posts,
  drafts,
  connected
}: {
  readonly posts: readonly DraftRecord[];
  readonly drafts: readonly DraftRecord[];
  readonly connected: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const results = [...posts, ...drafts].filter((item) =>
    `${item.title} ${item.description} ${item.markdown}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <PageHeader title="Search" description="Search through your blogs and drafts." />
      <section className="p-6">
        <Panel title="Search content">
          <input
            aria-label="Search content"
            placeholder="Search blogs and drafts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-4 space-y-3">
            {!connected ? (
              <p className="text-sm text-zinc-600">Repository not connected.</p>
            ) : results.length === 0 && query ? (
              <p className="text-sm text-zinc-600">No results found.</p>
            ) : (
              results.map((item) => (
                <div key={item.id} className="rounded-md border border-zinc-200 p-3">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-zinc-600">{item.description}</p>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>
    </>
  );
}

function AnalyticsPage() {
  const url = createGoogleOAuthUrl({
    clientId: "example-client-id",
    redirectUri: "http://localhost:5173/analytics",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    state: "ilm-local"
  });

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Connect user-owned Google Analytics and Search Console accounts."
      />
      <section className="grid gap-4 p-6 md:grid-cols-3">
        <StatusCard title="Sessions" value="Connect Google" icon={<BarChart3 />} />
        <StatusCard title="Clicks" value="Connect Search Console" icon={<Search />} />
        <StatusCard title="Auth Provider" value={new URL(url).hostname} icon={<KeyRound />} />
      </section>
    </>
  );
}

function SettingsPage({
  repository,
  geminiApiKey,
  geminiEncrypted,
  googleAnalyticsId,
  siteUrl,
  hasFrontend,
  isInitializingTemplate,
  onSaveGeminiKey,
  onClearGeminiKey,
  onSaveSiteUrl,
  onInitializeTemplate
}: {
  readonly repository?: ConnectedRepository;
  readonly geminiApiKey: string;
  readonly geminiEncrypted: boolean;
  readonly googleAnalyticsId?: string;
  readonly siteUrl?: string;
  readonly hasFrontend: boolean;
  readonly isInitializingTemplate?: boolean;
  readonly onSaveGeminiKey: (key: string, passphrase?: string) => void;
  readonly onClearGeminiKey: () => void;
  readonly onSaveSiteUrl: (url: string) => void;
  readonly onInitializeTemplate: () => void;
}) {
  const [apiKeyInput, setApiKeyInput] = React.useState(geminiApiKey);
  const [passphraseInput, setPassphraseInput] = React.useState("");
  const [storeLocally, setStoreLocally] = React.useState(false);
  const [urlInput, setUrlInput] = React.useState(siteUrl || "");

  React.useEffect(() => {
    setApiKeyInput(geminiApiKey);
  }, [geminiApiKey]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Control repository, AI, analytics, SEO, theme, and credential policies."
      />
      <section className="grid gap-4 p-6 lg:grid-cols-2">
        <Panel title="GitHub">
          <Metric label="Repository" value={repository?.fullName ?? "Not connected"} />
          <Metric label="Branch" value={repository?.branch ?? "main"} />
        </Panel>

        {!hasFrontend && repository && (
          <Panel title="Frontend Setup">
            <div className="space-y-4">
              <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
                <h3 className="text-sm font-semibold text-amber-800">No Frontend Detected</h3>
                <p className="mt-2 text-sm text-amber-700">
                  This repository does not seem to have a frontend framework configured. Ilm is a
                  Headless CMS, meaning it only manages content. Without a frontend, your blog will
                  not be visible on the web.
                </p>
                <div className="mt-4">
                  <Button
                    onClick={onInitializeTemplate}
                    disabled={isInitializingTemplate}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                  >
                    {isInitializingTemplate ? "Initializing..." : "Initialize Astro Blog Template"}
                  </Button>
                </div>
              </div>
            </div>
          </Panel>
        )}

        <Panel title="SEO & Analytics">
          <div className="space-y-4">
            <div>
              <Metric label="Google Analytics ID" value={googleAnalyticsId || "Not configured"} />
              <p className="mt-1 text-xs text-zinc-500">Loaded from config/seo.ts</p>
            </div>
            <div>
              <Metric label="Search Console ID" value="Not configured" />
              <p className="mt-1 text-xs text-zinc-500">Loaded from config/seo.ts</p>
            </div>
            <div>
              <Metric label="Canonical Base URL" value={siteUrl || "Not configured"} />
              <p className="mt-1 text-xs text-zinc-500">
                Fallback for RSS and Sitemap. e.g. https://myblog.com
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-300 p-2 text-sm focus:border-zinc-950 focus:outline-none"
                />
                <Button onClick={() => onSaveSiteUrl(urlInput)}>Save URL</Button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Gemini AI (BYOK)">
          <div className="space-y-4">
            <Field label="Gemini API Key">
              <input
                type="password"
                placeholder={geminiApiKey ? "••••••••••••••••" : "Enter your Gemini API key"}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full rounded-md border border-zinc-300 p-2 text-sm focus:border-zinc-950 focus:outline-none"
              />
            </Field>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="storeLocally"
                checked={storeLocally}
                onChange={(e) => setStoreLocally(e.target.checked)}
                className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
              />
              <label htmlFor="storeLocally" className="text-sm font-medium text-zinc-700">
                Encrypt and save locally (requires passphrase)
              </label>
            </div>

            {storeLocally && (
              <Field label="Passphrase">
                <input
                  type="password"
                  placeholder="Enter passphrase to encrypt key"
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 p-2 text-sm focus:border-zinc-950 focus:outline-none"
                />
              </Field>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() =>
                  onSaveGeminiKey(apiKeyInput, storeLocally ? passphraseInput : undefined)
                }
                disabled={!apiKeyInput}
              >
                Save API Key
              </Button>
              {geminiApiKey && (
                <Button variant="ghost" onClick={onClearGeminiKey}>
                  Clear Key
                </Button>
              )}
            </div>

            <div className="text-xs text-zinc-500">
              {geminiEncrypted ? (
                <span className="text-green-600 font-medium">
                  Key is encrypted and stored locally
                </span>
              ) : geminiApiKey ? (
                <span className="text-blue-600 font-medium">
                  Key is loaded for this session only
                </span>
              ) : (
                <span>No API key set. Connect a key to enable AI Suggest.</span>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Security">
          <p className="text-sm text-zinc-600">
            Access tokens belong to the user session. The CMS does not introduce a traditional
            database or copy your content to our servers.
          </p>
        </Panel>
      </section>
    </>
  );
}

function StatusCard({
  title,
  value,
  icon,
  loading
}: {
  readonly title: string;
  readonly value: string;
  readonly icon: React.ReactNode;
  readonly loading?: boolean;
}) {
  return (
    <article className="rounded-md border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-zinc-100 text-zinc-700">
        {icon}
      </div>
      <h2 className="text-sm font-medium text-zinc-600">{title}</h2>
      {loading ? (
        <div className="mt-2 h-6 w-24 animate-pulse rounded bg-zinc-200"></div>
      ) : (
        <p className="mt-2 break-words text-base font-semibold">{value}</p>
      )}
    </article>
  );
}

function Panel({
  title,
  children
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="break-words text-right font-medium">{value}</dd>
    </div>
  );
}

function EmptyState({
  title,
  description
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-zinc-600">{description}</p>
    </div>
  );
}

function buildDraftFrontmatter(draft: DraftRecord): DraftFrontmatter {
  return {
    title: draft.title,
    description: draft.description,
    slug: draft.slug,
    updatedAt: new Date().toISOString(),
    tags: splitCsv(draft.tags),
    categories: splitCsv(draft.categories),
    author: draft.author
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function upsertById<T extends { readonly id: string }>(items: readonly T[], item: T): T[] {
  const without = items.filter((existing) => existing.id !== item.id);
  return [item, ...without];
}
