import { Octokit } from "@octokit/rest";
import { CommitManifest } from "@ilm/publishing";
import { RepositoryEntry } from "@ilm/repository";

export type GitHubRepositoryRef = {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
};

export type GitHubFileWrite = {
  readonly path: string;
  readonly content: string;
  readonly encoding: "utf-8" | "base64";
  readonly operation?: "upsert" | "delete";
};

export type GitHubCommitRequest = GitHubRepositoryRef & {
  readonly message: string;
  readonly files: readonly GitHubFileWrite[];
};

export type GitHubWorkflowStatus = "queued" | "in_progress" | "completed" | "failed";

export type GitHubPagesSite = {
  readonly htmlUrl: string;
  readonly status?: string;
  readonly buildType?: string;
};

export type GitHubRepositorySummary = {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
  readonly installationId?: number;
};

export type GitHubCommitResult = {
  readonly sha: string;
  readonly fileCount: number;
};

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  static async listAvailableRepositories(userToken: string): Promise<GitHubRepositorySummary[]> {
    const octokit = new Octokit({ auth: userToken });
    const installations = await paginateGitHub(
      (page) =>
        octokit.apps.listInstallationsForAuthenticatedUser({
          per_page: 100,
          page
        }),
      (response) => response.data.installations
    );

    const allRepos: GitHubRepositorySummary[] = [];
    for (const inst of installations) {
      const repositories = await paginateGitHub(
        (page) =>
          octokit.apps.listInstallationReposForAuthenticatedUser({
            installation_id: inst.id,
            per_page: 100,
            page
          }),
        (response) => response.data.repositories
      );

      const repos = repositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        installationId: inst.id
      }));
      allRepos.push(...repos);
    }

    return allRepos;
  }

  async listRepositories() {
    const response = await this.octokit.apps.listReposAccessibleToInstallation({
      per_page: 100
    });
    return response.data.repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch
    }));
  }

  async getRepositoryEntries(ref: {
    owner: string;
    repo: string;
    branch: string;
  }): Promise<RepositoryEntry[]> {
    const response = await this.octokit.git.getTree({
      owner: ref.owner,
      repo: ref.repo,
      tree_sha: ref.branch,
      recursive: "true"
    });
    return response.data.tree.map((item) => ({
      path: item.path || "",
      type: item.type === "tree" ? "directory" : "file"
    }));
  }

  async getFileContent(
    ref: { owner: string; repo: string; branch: string },
    path: string
  ): Promise<string> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: ref.owner,
        repo: ref.repo,
        path,
        ref: ref.branch
      });
      if (
        typeof response.data === "object" &&
        response.data !== null &&
        "content" in response.data
      ) {
        return atob(response.data.content);
      }
      throw new Error("Target path is not a file");
    } catch (error) {
      console.error(`Error fetching file ${path} from GitHub:`, error);
      throw error;
    }
  }

  async executeCommit(request: GitHubCommitRequest): Promise<GitHubCommitResult> {
    const branchRef = await this.octokit.git.getRef({
      owner: request.owner,
      repo: request.repo,
      ref: `heads/${request.branch}`
    });
    const baseCommitSha = branchRef.data.object.sha;
    const baseCommit = await this.octokit.git.getCommit({
      owner: request.owner,
      repo: request.repo,
      commit_sha: baseCommitSha
    });

    const tree = await this.octokit.git.createTree({
      owner: request.owner,
      repo: request.repo,
      base_tree: baseCommit.data.tree.sha,
      tree: (
        await Promise.all(
          request.files.map(async (file) => {
            if (file.operation === "delete") {
              try {
                // Verify the file exists in the branch before attempting to delete
                await this.octokit.repos.getContent({
                  owner: request.owner,
                  repo: request.repo,
                  path: file.path,
                  ref: request.branch
                });
                return {
                  path: file.path,
                  mode: "100644" as const,
                  type: "blob" as const,
                  sha: null
                };
              } catch (err: unknown) {
                // If the file is not found (404), it's already deleted or never existed.
                if (isGitHubStatusError(err, 404)) {
                  return null;
                }
                throw err;
              }
            }

            if (file.encoding === "base64") {
              const blob = await this.octokit.git.createBlob({
                owner: request.owner,
                repo: request.repo,
                content: file.content,
                encoding: "base64"
              });

              return {
                path: file.path,
                mode: "100644" as const,
                type: "blob" as const,
                sha: blob.data.sha
              };
            }

            return {
              path: file.path,
              mode: "100644" as const,
              type: "blob" as const,
              content: file.content
            };
          })
        )
      ).filter((item): item is NonNullable<typeof item> => item !== null)
    });

    const commit = await this.octokit.git.createCommit({
      owner: request.owner,
      repo: request.repo,
      message: request.message,
      tree: tree.data.sha,
      parents: [baseCommitSha]
    });

    await this.octokit.git.updateRef({
      owner: request.owner,
      repo: request.repo,
      ref: `heads/${request.branch}`,
      sha: commit.data.sha
    });

    return {
      sha: commit.data.sha,
      fileCount: request.files.length
    };
  }

  async getWorkflowStatus(ref: GitHubRepositoryRef): Promise<GitHubWorkflowStatus> {
    const response = await this.octokit.actions.listWorkflowRunsForRepo({
      owner: ref.owner,
      repo: ref.repo,
      branch: ref.branch,
      per_page: 1
    });
    const run = response.data.workflow_runs[0];
    if (!run) return "completed";
    if (run.status === "queued") return "queued";
    if (run.status === "in_progress" || run.status === "waiting" || run.status === "requested") {
      return "in_progress";
    }
    return run.conclusion === "success" ? "completed" : "failed";
  }

  async getWorkflowStatusForCommit(
    ref: GitHubRepositoryRef,
    commitSha: string
  ): Promise<GitHubWorkflowStatus> {
    const response = await this.octokit.actions.listWorkflowRunsForRepo({
      owner: ref.owner,
      repo: ref.repo,
      branch: ref.branch,
      per_page: 20
    });
    const run = response.data.workflow_runs.find((item) => item.head_sha === commitSha);
    if (!run) return "queued";

    const current = await this.octokit.actions.getWorkflowRun({
      owner: ref.owner,
      repo: ref.repo,
      run_id: run.id
    });
    return normalizeWorkflowRunStatus(current.data.status, current.data.conclusion);
  }

  async getPagesSite(ref: GitHubRepositoryRef): Promise<GitHubPagesSite | undefined> {
    try {
      const response = await this.octokit.repos.getPages({
        owner: ref.owner,
        repo: ref.repo
      });
      return normalizePagesSite(response.data);
    } catch (error: unknown) {
      if (isGitHubStatusError(error, 404)) return undefined;
      throw error;
    }
  }

  async ensurePagesSite(ref: GitHubRepositoryRef): Promise<GitHubPagesSite> {
    const current = await this.getPagesSite(ref);
    if (!current) {
      const created = await this.octokit.repos.createPagesSite({
        owner: ref.owner,
        repo: ref.repo,
        build_type: "workflow"
      });
      return normalizePagesSite(created.data);
    }

    if (current.buildType !== "workflow") {
      await this.octokit.repos.updateInformationAboutPagesSite({
        owner: ref.owner,
        repo: ref.repo,
        build_type: "workflow"
      });
      return (await this.getPagesSite(ref)) ?? current;
    }

    return current;
  }

  async initializeAstroTemplate(ref: GitHubRepositoryRef): Promise<GitHubCommitResult> {
    const TEMPLATE_OWNER = "ij-roy";
    const TEMPLATE_REPO = "Ilm";
    const TEMPLATE_PREFIX = "templates/astro-blog/";

    // 1. Fetch the recursive tree of the template repository
    const treeResponse = await this.octokit.git.getTree({
      owner: TEMPLATE_OWNER,
      repo: TEMPLATE_REPO,
      tree_sha: "main",
      recursive: "true"
    });

    // 2. Filter for files in the Astro template directory
    const templateFiles = treeResponse.data.tree.filter(
      (item) =>
        item.path && item.path.startsWith(TEMPLATE_PREFIX) && item.type === "blob" && item.sha
    );

    if (templateFiles.length === 0) {
      throw new Error("Could not find template files in the source repository.");
    }

    // 3. Download the base64 content for each blob
    const commitFiles: GitHubFileWrite[] = await Promise.all(
      templateFiles.map(async (file) => {
        const blob = await this.octokit.git.getBlob({
          owner: TEMPLATE_OWNER,
          repo: TEMPLATE_REPO,
          file_sha: file.sha!
        });

        // Strip the templates/astro-blog/ prefix
        const targetPath = file.path!.substring(TEMPLATE_PREFIX.length);

        return {
          operation: "upsert" as const,
          path: targetPath,
          content: blob.data.content,
          encoding: "base64" as const
        };
      })
    );

    // 4. Add the GitHub Actions deployment workflow
    const deployWorkflowContent = `name: Deploy to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install dependencies
        run: npm install
      - name: Build
        run: npm run build
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

    commitFiles.push(
      {
        operation: "upsert",
        path: "content/posts/welcome.md",
        content: `---
title: "Welcome to Ilm"
slug: "welcome-to-ilm"
description: "Your first live post managed by Ilm."
publishedAt: "${new Date().toISOString()}"
updatedAt: "${new Date().toISOString()}"
tags: ["ilm"]
categories: ["publishing"]
author: "Ilm"
---

# Welcome to Ilm

This post lives in your repository at \`content/posts/welcome.md\` and is rendered by your static site.
`,
        encoding: "utf-8"
      },
      {
        operation: "upsert",
        path: "content/drafts/.gitkeep",
        content: "",
        encoding: "utf-8"
      },
      {
        operation: "upsert",
        path: "media/images/.gitkeep",
        content: "",
        encoding: "utf-8"
      },
      {
        operation: "upsert",
        path: "media/covers/.gitkeep",
        content: "",
        encoding: "utf-8"
      },
      {
        operation: "upsert",
        path: "media/attachments/.gitkeep",
        content: "",
        encoding: "utf-8"
      },
      {
        operation: "upsert",
        path: "config/site.ts",
        content: `export const siteConfig = {
  title: "Ilm Blog",
  description: "A GitHub-backed static blog powered by Ilm.",
  url: "https://example.com",
  locale: "en",
  author: {
    name: "Ilm Author"
  }
};
`,
        encoding: "utf-8"
      },
      {
        operation: "upsert",
        path: "config/seo.ts",
        content: `export const seoConfig = {
  defaultTitle: "Ilm Blog",
  defaultDescription: "A GitHub-backed static blog powered by Ilm.",
  canonicalBaseUrl: "https://example.com",
  robots: "index,follow"
};
`,
        encoding: "utf-8"
      },
      {
        operation: "upsert",
        path: "config/navigation.ts",
        content: `export const navigationConfig = {
  header: [{ label: "Home", href: "/" }],
  footer: []
};
`,
        encoding: "utf-8"
      },
      {
        operation: "upsert",
        path: ".github/workflows/deploy.yml",
        content: deployWorkflowContent,
        encoding: "utf-8"
      }
    );

    // 5. Commit everything to the user's repository
    return this.executeCommit({
      owner: ref.owner,
      repo: ref.repo,
      branch: ref.branch,
      message: "Initialize Astro blog template and GitHub Actions deploy workflow",
      files: commitFiles
    });
  }
}

type GitHubPaginatedResponse<T> = {
  readonly data: T;
  readonly headers?: {
    readonly link?: string;
  };
};

async function paginateGitHub<TResponse extends GitHubPaginatedResponse<unknown>, TItem>(
  requestPage: (page: number) => Promise<TResponse>,
  selectItems: (response: TResponse) => readonly TItem[]
): Promise<TItem[]> {
  const items: TItem[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const response = await requestPage(page);
    items.push(...selectItems(response));
    hasNext = Boolean(response.headers?.link?.includes('rel="next"'));
    page += 1;
  }

  return items;
}

function isGitHubStatusError(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { readonly status?: unknown }).status === status
  );
}

function normalizeWorkflowRunStatus(
  status?: string | null,
  conclusion?: string | null
): GitHubWorkflowStatus {
  if (status === "queued" || status === "requested" || status === "waiting") return "queued";
  if (status === "in_progress") return "in_progress";
  if (status !== "completed") return "in_progress";
  return conclusion === "success" ? "completed" : "failed";
}

function normalizePagesSite(data: {
  readonly html_url?: string | null;
  readonly status?: string | null;
  readonly build_type?: string | null;
}): GitHubPagesSite {
  return {
    htmlUrl: data.html_url ?? "",
    status: data.status ?? undefined,
    buildType: data.build_type ?? undefined
  };
}

export class LocalGitHubClient {
  private readonly repositories: GitHubRepositorySummary[] = [
    {
      id: 1,
      name: "ilm-test-blog",
      fullName: "ij-roy/ilm-test-blog",
      private: false,
      defaultBranch: "main"
    }
  ];

  private readonly files = new Map<string, string>([
    [
      "ij-roy/ilm-test-blog/main/config/seo.ts",
      `export const seoConfig = {
  defaultTitle: "Ilm Starter Blog",
  defaultDescription: "A git-native user-owned blog generated by Ilm.",
  canonicalBaseUrl: "https://example.com",
  robots: "index,follow",
  googleAnalyticsId: "G-LMQE07LDNJ"
};`
    ]
  ]);

  async listRepositories(): Promise<GitHubRepositorySummary[]> {
    return this.repositories;
  }

  async getRepositoryEntries(): Promise<RepositoryEntry[]> {
    return [
      { path: "content", type: "directory" },
      { path: "content/posts", type: "directory" },
      { path: "content/drafts", type: "directory" },
      { path: "media", type: "directory" },
      { path: "media/images", type: "directory" },
      { path: "media/covers", type: "directory" },
      { path: "media/attachments", type: "directory" },
      { path: "config", type: "directory" },
      { path: "config/site.ts", type: "file" },
      { path: "config/seo.ts", type: "file" },
      { path: "config/navigation.ts", type: "file" },
      { path: "site/astro", type: "directory" },
      { path: ".github/workflows", type: "directory" }
    ];
  }

  async getFileContent(
    ref: { owner: string; repo: string; branch: string },
    path: string
  ): Promise<string> {
    const key = `${ref.owner}/${ref.repo}/${ref.branch}/${path}`;
    return this.files.get(key) || "";
  }

  async executeCommit(request: GitHubCommitRequest): Promise<GitHubCommitResult> {
    for (const file of request.files) {
      const key = `${request.owner}/${request.repo}/${request.branch}/${file.path}`;
      if (file.operation === "delete") {
        this.files.delete(key);
      } else {
        this.files.set(key, file.content);
      }
    }

    return {
      sha: createStableSha(request),
      fileCount: request.files.length
    };
  }

  async getWorkflowStatus(): Promise<GitHubWorkflowStatus> {
    return "completed";
  }

  async getWorkflowStatusForCommit(): Promise<GitHubWorkflowStatus> {
    return "completed";
  }

  async getPagesSite(): Promise<GitHubPagesSite> {
    return {
      htmlUrl: "https://ij-roy.github.io/ilm-test-blog/",
      status: "built",
      buildType: "workflow"
    };
  }

  async ensurePagesSite(): Promise<GitHubPagesSite> {
    return this.getPagesSite();
  }

  async initializeAstroTemplate(ref: GitHubRepositoryRef): Promise<GitHubCommitResult> {
    // Local mock implementation
    return this.executeCommit({
      owner: ref.owner,
      repo: ref.repo,
      branch: ref.branch,
      message: "Initialize Astro blog template (Mock)",
      files: [
        { operation: "upsert", path: "package.json", content: "{}", encoding: "utf-8" },
        {
          operation: "upsert",
          path: ".github/workflows/deploy.yml",
          content: "# Mock Deploy",
          encoding: "utf-8"
        }
      ]
    });
  }
}

export function manifestToCommitRequest(
  ref: GitHubRepositoryRef,
  manifest: CommitManifest
): GitHubCommitRequest {
  return {
    ...ref,
    message: manifest.message,
    files: manifest.files
  };
}

function createStableSha(request: GitHubCommitRequest): string {
  const source = `${request.owner}/${request.repo}/${request.branch}:${request.message}:${request.files
    .map((file) => `${file.operation ?? "upsert"}:${file.path}`)
    .join("|")}`;
  let hash = 0;
  for (const character of source) {
    hash = (hash << 5) - hash + character.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
