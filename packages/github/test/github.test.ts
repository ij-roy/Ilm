import { beforeEach, describe, expect, it, vi } from "vitest";

const octokitMock = {
  apps: {
    listInstallationsForAuthenticatedUser: vi.fn(),
    listInstallationReposForAuthenticatedUser: vi.fn()
  },
  repos: {
    getPages: vi.fn(),
    createPagesSite: vi.fn(),
    updateInformationAboutPagesSite: vi.fn()
  },
  actions: {
    listWorkflowRunsForRepo: vi.fn(),
    getWorkflowRun: vi.fn()
  }
};

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function Octokit() {
    return octokitMock;
  })
}));

import { GitHubClient, LocalGitHubClient, manifestToCommitRequest } from "../src/index";

describe("@ilm/github", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes publishing decisions without owning them", () => {
    const request = manifestToCommitRequest(
      { owner: "owner", repo: "repo", branch: "main" },
      {
        message: "publish: Hello",
        files: [{ path: "content/posts/hello.md", content: "# Hello", encoding: "utf-8" }]
      }
    );

    expect(request.files[0]?.path).toBe("content/posts/hello.md");
    expect(request.message).toBe("publish: Hello");
  });

  it("executes commit requests through the local development adapter", async () => {
    const client = new LocalGitHubClient();
    const repositories = await client.listRepositories();
    const result = await client.executeCommit({
      owner: "local",
      repo: "ilm-starter",
      branch: "main",
      message: "publish: Hello",
      files: [
        {
          path: "content/posts/hello.md",
          content: "# Hello",
          encoding: "utf-8",
          operation: "upsert"
        }
      ]
    });

    expect(repositories[0]?.fullName).toBe("ij-roy/ilm-test-blog");
    expect(result.fileCount).toBe(1);
    expect(result.sha).toMatch(/[0-9a-f]+/);
  });

  it("paginates installations and repositories when listing available repositories", async () => {
    octokitMock.apps.listInstallationsForAuthenticatedUser
      .mockResolvedValueOnce({
        data: { installations: [{ id: 1 }, { id: 2 }] },
        headers: { link: '<https://api.github.com/user/installations?page=2>; rel="next"' }
      })
      .mockResolvedValueOnce({
        data: { installations: [{ id: 3 }] },
        headers: {}
      });

    octokitMock.apps.listInstallationReposForAuthenticatedUser
      .mockResolvedValueOnce({
        data: {
          repositories: [
            { id: 10, name: "one", full_name: "owner/one", private: false, default_branch: "main" }
          ]
        },
        headers: {}
      })
      .mockResolvedValueOnce({
        data: {
          repositories: [
            { id: 20, name: "two", full_name: "owner/two", private: true, default_branch: "main" }
          ]
        },
        headers: {
          link: '<https://api.github.com/user/installations/2/repositories?page=2>; rel="next"'
        }
      })
      .mockResolvedValueOnce({
        data: {
          repositories: [
            {
              id: 21,
              name: "two-more",
              full_name: "owner/two-more",
              private: false,
              default_branch: "trunk"
            }
          ]
        },
        headers: {}
      })
      .mockResolvedValueOnce({
        data: {
          repositories: [
            {
              id: 30,
              name: "three",
              full_name: "owner/three",
              private: false,
              default_branch: "main"
            }
          ]
        },
        headers: {}
      });

    const repos = await GitHubClient.listAvailableRepositories("user-token");

    expect(repos.map((repo) => repo.fullName)).toEqual([
      "owner/one",
      "owner/two",
      "owner/two-more",
      "owner/three"
    ]);
    expect(octokitMock.apps.listInstallationsForAuthenticatedUser).toHaveBeenCalledTimes(2);
    expect(octokitMock.apps.listInstallationReposForAuthenticatedUser).toHaveBeenCalledTimes(4);
  });

  it("creates a workflow-backed GitHub Pages site when missing", async () => {
    octokitMock.repos.getPages.mockRejectedValueOnce({ status: 404 });
    octokitMock.repos.createPagesSite.mockResolvedValueOnce({
      data: { html_url: "https://owner.github.io/repo/", status: "built", build_type: "workflow" }
    });

    const client = new GitHubClient("installation-token");
    const site = await client.ensurePagesSite({ owner: "owner", repo: "repo", branch: "main" });

    expect(octokitMock.repos.createPagesSite).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      build_type: "workflow"
    });
    expect(site.htmlUrl).toBe("https://owner.github.io/repo/");
  });

  it("updates an existing Pages site to workflow build mode", async () => {
    octokitMock.repos.getPages
      .mockResolvedValueOnce({
        data: { html_url: "https://owner.github.io/repo/", status: "built", build_type: "legacy" }
      })
      .mockResolvedValueOnce({
        data: { html_url: "https://owner.github.io/repo/", status: "built", build_type: "workflow" }
      });
    octokitMock.repos.updateInformationAboutPagesSite.mockResolvedValueOnce({});

    const client = new GitHubClient("installation-token");
    const site = await client.ensurePagesSite({ owner: "owner", repo: "repo", branch: "main" });

    expect(octokitMock.repos.updateInformationAboutPagesSite).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      build_type: "workflow"
    });
    expect(site.buildType).toBe("workflow");
  });

  it("polls the workflow run for the exact publish commit", async () => {
    octokitMock.actions.listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [
          { id: 1, head_sha: "other-sha", status: "completed", conclusion: "success" },
          { id: 2, head_sha: "publish-sha", status: "in_progress", conclusion: null }
        ]
      }
    });
    octokitMock.actions.getWorkflowRun.mockResolvedValueOnce({
      data: { id: 2, head_sha: "publish-sha", status: "completed", conclusion: "success" }
    });

    const client = new GitHubClient("installation-token");
    const status = await client.getWorkflowStatusForCommit(
      { owner: "owner", repo: "repo", branch: "main" },
      "publish-sha"
    );

    expect(octokitMock.actions.getWorkflowRun).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      run_id: 2
    });
    expect(status).toBe("completed");
  });
});
