import * as React from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
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
  UploadCloud
} from "lucide-react";
import { createSuggestion } from "@ilm/ai";
import { createGoogleOAuthUrl } from "@ilm/analytics";
import { estimateReadingTimeMinutes, extractOutline, isLocalDraftNewer } from "@ilm/editor";
import { LocalGitHubClient, manifestToCommitRequest } from "@ilm/github";
import { planMediaAsset } from "@ilm/media";
import { createDraftSavePlan, createPublishPlan, validatePublishPlan } from "@ilm/publishing";
import {
  DraftFrontmatter,
  RepositoryEntry,
  RepositoryLayout,
  validateRepositoryStructure
} from "@ilm/repository";
import { generateSeoMetadata, generateSlug, scoreSeo } from "@ilm/seo";
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
};

type PublishEvent = {
  readonly id: string;
  readonly stage: string;
  readonly message: string;
  readonly createdAt: string;
};

type CmsState = {
  readonly repository?: ConnectedRepository;
  readonly activeDraft: DraftRecord;
  readonly drafts: readonly DraftRecord[];
  readonly posts: readonly DraftRecord[];
  readonly media: readonly MediaRecord[];
  readonly events: readonly PublishEvent[];
  readonly aiSuggestion?: string;
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

const storageKey = "ilm.cms.state.v1";
const githubClient = new LocalGitHubClient();

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

const requiredRepositoryEntries: RepositoryEntry[] = [
  RepositoryLayout.posts,
  RepositoryLayout.drafts,
  RepositoryLayout.images,
  RepositoryLayout.covers,
  RepositoryLayout.attachments,
  RepositoryLayout.config,
  RepositoryLayout.siteConfig,
  RepositoryLayout.seoConfig,
  RepositoryLayout.navigationConfig,
  RepositoryLayout.astroSite,
  RepositoryLayout.workflows
].map((path) => ({
  path,
  type: path.endsWith(".ts") ? "file" : "directory"
}));

function createInitialState(): CmsState {
  return {
    activeDraft: initialDraft,
    drafts: [],
    posts: [],
    media: [],
    events: []
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
  const repositoryValidation = validateRepositoryStructure(requiredRepositoryEntries);

  function addEvent(stage: string, message: string) {
    setState((current) => ({
      ...current,
      events: [
        { id: crypto.randomUUID(), stage, message, createdAt: new Date().toISOString() },
        ...current.events
      ].slice(0, 8)
    }));
  }

  async function connectRepository() {
    const repositories = await githubClient.listRepositories();
    const repository = repositories[0];
    if (!repository) return;

    setState((current) => ({
      ...current,
      repository: {
        owner: "local",
        repo: repository.name,
        branch: repository.defaultBranch,
        fullName: repository.fullName
      }
    }));
    setStatus(`Connected ${repository.fullName}`);
    addEvent("repository", `Connected ${repository.fullName}`);
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

  function createAiSuggestion() {
    const suggestion = createSuggestion(
      {
        kind: "improve-writing",
        selectedText: state.activeDraft.description,
        contextMarkdown: state.activeDraft.markdown
      },
      `${state.activeDraft.description} This draft is ready for a clearer reader promise.`
    );
    setState((current) => ({ ...current, aiSuggestion: suggestion.content }));
    addEvent("ai", "AI suggestion prepared for approval");
  }

  function approveAiSuggestion() {
    if (!state.aiSuggestion) return;
    updateDraft({ description: state.aiSuggestion });
    setState((current) => ({ ...current, aiSuggestion: undefined }));
    addEvent("ai", "AI suggestion approved");
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

    const result = await githubClient.executeCommit(
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

    const result = await githubClient.executeCommit(
      manifestToCommitRequest(state.repository, plan.value.commit)
    );
    setState((current) => ({
      ...current,
      activeDraft: { ...current.activeDraft, publishedSha: result.sha },
      posts: upsertById(current.posts, { ...current.activeDraft, publishedSha: result.sha }),
      drafts: current.drafts.filter((draft) => draft.id !== current.activeDraft.id)
    }));
    setStatus(`Published at ${result.sha}`);
    addEvent("publish", `Published ${plan.value.postPath}`);
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
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <Dashboard
                  state={state}
                  status={status}
                  seoScore={seoScore}
                  repositoryValid={repositoryValidation.ok}
                  onConnect={connectRepository}
                />
              }
            />
            <Route
              path="/editor"
              element={
                <EditorPage
                  draft={state.activeDraft}
                  seoScore={seoScore}
                  seoUrl={seo.canonicalUrl}
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
            <Route path="/settings" element={<SettingsPage repository={state.repository} />} />
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
  onConnect
}: {
  readonly state: CmsState;
  readonly status: string;
  readonly seoScore: number;
  readonly repositoryValid: boolean;
  readonly onConnect: () => void;
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
        />
        <StatusCard
          title="Contract"
          value={repositoryValid ? "Valid template" : "Needs review"}
          icon={<CheckCircle2 />}
        />
        <StatusCard title="SEO score" value={`${seoScore}/100`} icon={<Search />} />
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
          <Button className="mt-4" onClick={onConnect}>
            <KeyRound className="h-4 w-4" />
            Connect GitHub
          </Button>
        </div>
      </section>
    </>
  );
}

function EditorPage({
  draft,
  seoScore,
  seoUrl,
  outline,
  readingTime,
  aiSuggestion,
  localRecoveryAvailable,
  onChange,
  onGenerateSlug,
  onSuggest,
  onApproveSuggestion,
  onSaveDraft,
  onPublish
}: {
  readonly draft: DraftRecord;
  readonly seoScore: number;
  readonly seoUrl: string;
  readonly outline: readonly { title: string; anchor: string; level: number }[];
  readonly readingTime: number;
  readonly aiSuggestion?: string;
  readonly localRecoveryAvailable: boolean;
  readonly onChange: (patch: Partial<DraftRecord>) => void;
  readonly onGenerateSlug: () => void;
  readonly onSuggest: () => void;
  readonly onApproveSuggestion: () => void;
  readonly onSaveDraft: () => void;
  readonly onPublish: () => void;
}) {
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
              <Field label="Description">
                <input
                  value={draft.description}
                  onChange={(event) => onChange({ description: event.target.value })}
                />
              </Field>
            </div>
          </Panel>
          <Panel title="Markdown editor">
            <textarea
              aria-label="Post markdown"
              className="min-h-[420px] w-full resize-y rounded-md border border-zinc-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
              value={draft.markdown}
              onChange={(event) => onChange({ markdown: event.target.value })}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" onClick={onSaveDraft}>
                Save Draft
              </Button>
              <Button type="button" variant="secondary" onClick={onPublish}>
                Publish
              </Button>
              <Button type="button" variant="ghost" onClick={onSuggest}>
                <Sparkles className="h-4 w-4" />
                AI Suggest
              </Button>
            </div>
          </Panel>
        </div>
        <aside className="space-y-4">
          <Panel title="SEO">
            <p className="text-3xl font-semibold">{seoScore}/100</p>
            <p className="mt-2 break-words text-sm text-zinc-600">{seoUrl}</p>
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
          {aiSuggestion ? (
            <Panel title="AI suggestion">
              <p className="text-sm text-zinc-700">{aiSuggestion}</p>
              <Button
                className="mt-3"
                type="button"
                variant="secondary"
                onClick={onApproveSuggestion}
              >
                Approve
              </Button>
            </Panel>
          ) : null}
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

function SettingsPage({ repository }: { readonly repository?: ConnectedRepository }) {
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
  icon
}: {
  readonly title: string;
  readonly value: string;
  readonly icon: React.ReactNode;
}) {
  return (
    <article className="rounded-md border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-zinc-100 text-zinc-700">
        {icon}
      </div>
      <h2 className="text-sm font-medium text-zinc-600">{title}</h2>
      <p className="mt-2 break-words text-base font-semibold">{value}</p>
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
