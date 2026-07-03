import { Octokit } from "@octokit/rest";
import { CommitManifest } from "@ilm/publishing";

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

  async listRepositories() {
    const response = await this.octokit.repos.listForAuthenticatedUser({
      affiliation: "owner,collaborator",
      sort: "updated"
    });
    return response.data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch
    }));
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
      tree: await Promise.all(
        request.files.map(async (file) => {
          if (file.operation === "delete") {
            return {
              path: file.path,
              mode: "100644" as const,
              type: "blob" as const,
              sha: null
            };
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
      name: "ilm-starter",
      fullName: "local/ilm-starter",
      private: false,
      defaultBranch: "main"
    }
  ];

  private readonly files = new Map<string, string>();

  async listRepositories(): Promise<GitHubRepositorySummary[]> {
    return this.repositories;
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
