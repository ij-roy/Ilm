import * as React from "react";
import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
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
  ListOrdered
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
  GitHubRepositorySummary
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
  readonly accessToken?: string;
  readonly installationId?: string;
  readonly geminiApiKey?: string;
  readonly geminiEncryptedKey?: string;
  readonly googleAnalyticsId?: string;
};

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Editor", href: "/editor", icon: PenLine },
  { label: "Posts", href: "/posts", icon: FileText },
  { label: "Drafts", href: "/drafts", icon: FolderGit2 },
  { label: "Media", href: "/media", icon: Image },
  { label: "Search", href: "/search", icon: Search },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings }
];

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
    geminiApiKey: "",
    geminiEncryptedKey: "",
    googleAnalyticsId: ""
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
      events: parsed.events ?? []
    };
  } catch {
    return createInitialState();
  }
}

export function App() {
  return (
    <BrowserRouter>
      <CmsApplication />
    </BrowserRouter>
  );
}

function CmsApplication() {
  const [state, setState] = React.useState<CmsState>(() => readState());
  const [status, setStatus] = React.useState("Ready");

  React.useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const activeGithubClient = React.useMemo(() => {
    return state.accessToken ? new GitHubClient(state.accessToken) : defaultLocalGithubClient;
  }, [state.accessToken]);

  const [appMetadata, setAppMetadata] = React.useState<AppMetadata | null>(null);

  React.useEffect(() => {
    const workerUrl = import.meta.env.VITE_GITHUB_AUTH_WORKER_URL;
    if (!workerUrl) return;

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
      })
      .catch((err: unknown) => {
        if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
          console.warn(
            "Could not load GitHub App metadata:",
            (err as Error).message || String(err)
          );
        }
      });
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get("installation_id");
    const accessToken = params.get("access_token");
    const errorMsg = params.get("error");
    const setupAction = params.get("setup_action");

    if (errorMsg) {
      setStatus(`GitHub connection failed: ${errorMsg}`);
      addEvent("auth", `Auth error: ${errorMsg}`);
    } else if (installationId && accessToken) {
      setState((current) => ({
        ...current,
        accessToken: accessToken,
        installationId: installationId
      }));
      setStatus("GitHub connected successfully!");
      addEvent("auth", `Authenticated App Installation ${installationId}`);

      if (setupAction === "update") {
        // Automatically reload repositories if the user just updated their installation
        setStatus("Refreshing repositories...");
        setTimeout(() => loadRepositories(), 500);
      }

      const cleanUrl = window.location.pathname + window.location.hash;
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
    canonicalBaseUrl: "https://example.com",
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

  function addEvent(stage: string, message: string) {
    setState((current) => ({
      ...current,
      events: [
        { id: crypto.randomUUID(), stage, message, createdAt: new Date().toISOString() },
        ...current.events
      ].slice(0, 8)
    }));
  }

  async function loadRepositories() {
    try {
      const repositories = await activeGithubClient.listRepositories();
      setState((curr) => ({ ...curr, availableRepositories: repositories }));
    } catch (err: unknown) {
      setStatus(`Failed to load repositories: ${(err as Error).message}`);
    }
  }

  function selectRepository(repoId: number) {
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
    setStatus(`Connected ${repository.fullName}`);
    addEvent("repository", `Connected ${repository.fullName}`);
  }

  function disconnectRepository() {
    setState((current) => ({ ...current, repository: undefined }));
    setStatus("Disconnected repository");
  }

  function handleConnectGitHub() {
    if (appMetadata) {
      const state = encodeURIComponent(window.location.origin);
      window.location.href = `${appMetadata.htmlUrl}/installations/new?state=${state}`;
    }
  }

  function handleConfigureRepositories() {
    if (state.installationId) {
      window.open(`https://github.com/settings/installations/${state.installationId}`, "_blank");
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

  async function publishPost() {
    if (!state.repository) {
      setStatus("Connect a repository before publishing.");
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

    setState((c) => ({ ...c, publishProgress: "creating-commit" }));
    setStatus("Committing post to GitHub...");

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
    addEvent("publish", `Committed ${plan.value.postPath}`);

    for (let attempts = 0; attempts < 30; attempts++) {
      await new Promise((res) => setTimeout(res, 2000));

      try {
        const status = await activeGithubClient.getWorkflowStatus(state.repository);
        if (status === "completed") {
          setState((c) => ({ ...c, publishProgress: "published" }));
          setStatus("Published successfully!");
          addEvent("publish", "GitHub Pages deployment completed");
          break;
        } else if (status === "failed") {
          setState((c) => ({ ...c, publishProgress: "failed" }));
          setStatus("GitHub Actions build failed. Check repository logs.");
          addEvent("publish", "Build failed");
          break;
        } else if (status === "in_progress") {
          setState((c) => ({ ...c, publishProgress: "deploying" }));
          setStatus("Deploying via GitHub Actions...");
        }
      } catch {
        setState((c) => ({ ...c, publishProgress: "failed" }));
        setStatus("Failed to read workflow status.");
        break;
      }
    }
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

  React.useEffect(() => {
    if (state.accessToken && !state.repository && !state.availableRepositories) {
      loadRepositories();
    }
  }, [state.accessToken, state.repository, state.availableRepositories]);

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
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[270px_1fr]">
        <aside className="border-r border-zinc-200 bg-white">
          <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-white">
              Ilm
            </div>
            <div>
              <p className="text-sm font-semibold">Ilm CMS</p>
              <p className="text-xs text-zinc-500">Git-native publishing</p>
            </div>
          </div>
          <nav aria-label="Primary" className="space-y-1 p-3">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                    isActive ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-100"
                  ].join(" ")
                }
              >
                <item.icon aria-hidden="true" className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-zinc-200 p-4 text-xs text-zinc-600">
            <p className="font-medium text-zinc-900">Repository</p>
            <p className="mt-1 break-words">{state.repository?.fullName ?? "Not connected"}</p>
          </div>
        </aside>
        <main className="min-w-0">
          <div
            role="status"
            className="border-b border-zinc-200 bg-white px-6 py-2 text-sm text-zinc-700"
          >
            {status}
          </div>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <Dashboard
                  state={state}
                  status={status}
                  seoScore={seoScore}
                  repositoryValid={repositoryValidation.ok}
                  onConnect={handleConnectGitHub}
                  onSelectRepository={selectRepository}
                  onDisconnectRepository={disconnectRepository}
                  onConfigureRepositories={handleConfigureRepositories}
                />
              }
            />
            <Route
              path="/editor"
              element={
                <EditorPage
                  draft={state.activeDraft}
                  seoScore={seoScore}
                  seoMetadata={seo}
                  outline={outline}
                  readingTime={estimateReadingTimeMinutes(state.activeDraft.markdown)}
                  aiSuggestion={state.aiSuggestion}
                  localRecoveryAvailable={localRecoveryAvailable}
                  onChange={updateDraft}
                  onGenerateSlug={generateSlugFromTitle}
                  onSuggest={createAiSuggestion}
                  onApproveSuggestion={approveAiSuggestion}
                  onSaveDraft={saveDraft}
                  onPublish={publishPost}
                  onAddMedia={addMedia}
                />
              }
            />
            <Route path="/posts" element={<ListPage title="Posts" items={state.posts} />} />
            <Route path="/drafts" element={<ListPage title="Drafts" items={state.drafts} />} />
            <Route path="/media" element={<MediaPage media={state.media} onAdd={addMedia} />} />
            <Route
              path="/search"
              element={<SearchPage posts={state.posts} drafts={state.drafts} />}
            />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  repository={state.repository}
                  geminiApiKey={state.geminiApiKey || ""}
                  geminiEncrypted={Boolean(state.geminiEncryptedKey)}
                  googleAnalyticsId={state.googleAnalyticsId}
                  onSaveGeminiKey={handleSaveGeminiKey}
                  onClearGeminiKey={handleClearGeminiKey}
                />
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
  seoScore,
  repositoryValid,
  onConnect,
  onSelectRepository,
  onDisconnectRepository,
  onConfigureRepositories
}: {
  readonly state: CmsState;
  readonly status: string;
  readonly seoScore: number;
  readonly repositoryValid: boolean;
  readonly onConnect: () => void;
  readonly onSelectRepository: (repoId: number) => void;
  readonly onDisconnectRepository: () => void;
  readonly onConfigureRepositories: () => void;
}) {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Connect a user-owned GitHub repository, continue writing, and monitor publishing status."
      />
      <section className="grid gap-4 p-6 lg:grid-cols-4">
        <StatusCard
          title="Repository"
          value={state.repository?.fullName ?? "Disconnected"}
          icon={<FolderGit2 />}
          loading={!state.repository && status.includes("Connecting")}
        />
        <StatusCard
          title="Contract"
          value={repositoryValid ? "Valid template" : "Needs review"}
          icon={<CheckCircle2 />}
          loading={!state.repository && status.includes("Connecting")}
        />
        <StatusCard
          title="SEO score"
          value={`${seoScore}/100`}
          icon={<Search />}
          loading={!state.repository && status.includes("Connecting")}
        />
        <StatusCard title="Last status" value={status} icon={<UploadCloud />} />
      </section>
      <section className="grid gap-4 px-6 pb-6 lg:grid-cols-[1fr_360px]">
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
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Repository connection</h2>
          <p className="mt-2 text-sm text-zinc-600">
            The development adapter uses the same manifest shape as GitHub commits, so save and
            publish flows are exercised without storing secrets locally.
          </p>
          {state.repository ? (
            <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3">
              <p className="text-sm font-medium text-green-900">
                Connected to {state.repository.fullName}
              </p>
              <Button type="button" className="mt-3" onClick={onDisconnectRepository}>
                Change Repository
              </Button>
            </div>
          ) : state.accessToken && state.availableRepositories ? (
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Select your repository:
              </label>
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-md border border-zinc-300 p-2 text-sm"
                  onChange={(e) => {
                    const repoId = Number(e.target.value);
                    if (repoId) onSelectRepository(repoId);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose a repository...
                  </option>
                  {state.availableRepositories.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 text-sm text-zinc-500">
                Don't see your repository?{" "}
                <button
                  type="button"
                  onClick={onConfigureRepositories}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Configure GitHub App permissions
                </button>
              </div>
            </div>
          ) : (
            <Button className="mt-4" onClick={onConnect}>
              <KeyRound className="h-4 w-4" />
              Connect GitHub
            </Button>
          )}
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
  onChange,
  onGenerateSlug,
  onSuggest,
  onApproveSuggestion,
  onSaveDraft,
  onPublish,
  onAddMedia
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
  readonly onChange: (patch: Partial<DraftRecord>) => void;
  readonly onGenerateSlug: () => void;
  readonly onSuggest: (kind: AiSuggestionKind) => void;
  readonly onApproveSuggestion: () => void;
  readonly onSaveDraft: () => void;
  readonly onPublish: () => void;
  readonly onAddMedia: (media: Omit<MediaRecord, "id">) => void;
}) {
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
          <Panel title="Post details">
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
          <Panel title="Markdown editor">
            <EditorToolbar editor={editor} />
            <EditorContent
              editor={editor}
              className="min-h-[420px] w-full rounded-md border border-zinc-300 bg-white p-4 text-sm leading-6 focus-within:border-zinc-950 focus-within:ring-2 focus-within:ring-zinc-200"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" onClick={onSaveDraft}>
                Save Draft
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onPublish}
                disabled={
                  publishProgress === "creating-commit" ||
                  publishProgress === "deploying" ||
                  publishProgress === "building"
                }
                title={seoScore < 50 ? "Warning: Low SEO score" : "Ready to publish"}
              >
                {publishProgress === "creating-commit"
                  ? "Committing..."
                  : publishProgress === "building" || publishProgress === "deploying"
                    ? "Deploying..."
                    : publishProgress === "published"
                      ? "Published!"
                      : `Publish ${seoScore < 50 ? "(Low SEO)" : ""}`}
              </Button>
            </div>
          </Panel>
        </div>
        <aside className="space-y-4">
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
  onAdd
}: {
  readonly media: readonly MediaRecord[];
  readonly onAdd: (input: Omit<MediaRecord, "id" | "path">) => void;
}) {
  const [fileName, setFileName] = React.useState("cover.webp");
  const [alt, setAlt] = React.useState("Cover image");

  return (
    <>
      <PageHeader
        title="Media"
        description="Plan images, covers, and attachments for repository-backed publishing."
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
              Add Cover
            </Button>
          </div>
        </Panel>
        <Panel title="Library">
          <div className="grid gap-3 md:grid-cols-2">
            {media.length === 0 ? (
              <p className="text-sm text-zinc-600">No media planned yet.</p>
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
  items
}: {
  readonly title: string;
  readonly items: readonly DraftRecord[];
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
            title={`No ${title.toLowerCase()} yet`}
            description="Use the editor to create content."
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
  drafts
}: {
  readonly posts: readonly DraftRecord[];
  readonly drafts: readonly DraftRecord[];
}) {
  const [query, setQuery] = React.useState("");
  const results = [...posts, ...drafts].filter((item) =>
    `${item.title} ${item.description} ${item.markdown}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <PageHeader
        title="Search"
        description="Search local CMS state while the template owns build-time Pagefind indexing."
      />
      <section className="p-6">
        <Panel title="Search content">
          <input
            aria-label="Search content"
            placeholder="Search posts and drafts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-4 space-y-3">
            {results.map((item) => (
              <div key={item.id} className="rounded-md border border-zinc-200 p-3">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-zinc-600">{item.description}</p>
              </div>
            ))}
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
        <StatusCard title="OAuth" value={new URL(url).hostname} icon={<KeyRound />} />
      </section>
    </>
  );
}

function SettingsPage({
  repository,
  geminiApiKey,
  geminiEncrypted,
  googleAnalyticsId,
  onSaveGeminiKey,
  onClearGeminiKey
}: {
  readonly repository?: ConnectedRepository;
  readonly geminiApiKey: string;
  readonly geminiEncrypted: boolean;
  readonly googleAnalyticsId?: string;
  readonly onSaveGeminiKey: (key: string, passphrase?: string) => void;
  readonly onClearGeminiKey: () => void;
}) {
  const [apiKeyInput, setApiKeyInput] = React.useState(geminiApiKey);
  const [passphraseInput, setPassphraseInput] = React.useState("");
  const [storeLocally, setStoreLocally] = React.useState(false);

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
              <Metric label="Canonical Base URL" value="https://example.com" />
              <p className="mt-1 text-xs text-zinc-500">Fallback for RSS and Sitemap</p>
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
                  ✓ Key is encrypted and stored locally
                </span>
              ) : geminiApiKey ? (
                <span className="text-blue-600 font-medium">
                  ✓ Key is loaded for this session only
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
            database or copy user content into this repository.
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
