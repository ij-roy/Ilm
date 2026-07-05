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
    const installationsRes = await octokit.apps.listInstallationsForAuthenticatedUser();

    const allRepos: GitHubRepositorySummary[] = [];
    for (const inst of installationsRes.data.installations) {
      const reposRes = await octokit.apps.listInstallationReposForAuthenticatedUser({
        installation_id: inst.id,
        per_page: 100
      });

      const repos = reposRes.data.repositories.map((repo) => ({
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
      if (response.data && "content" in response.data) {
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
      tree: (await Promise.all(
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
            } catch (err: any) {
              // If the file is not found (404), it's already deleted or never existed.
              if (err.status === 404) {
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
      )).filter((item): item is NonNullable<typeof item> => item !== null)
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
