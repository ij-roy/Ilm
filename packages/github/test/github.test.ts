import { beforeEach, describe, expect, it, vi } from "vitest";

const octokitMock = {
  apps: {
    listInstallationsForAuthenticatedUser: vi.fn(),
    listInstallationReposForAuthenticatedUser: vi.fn()
  },
  git: {
    getTree: vi.fn(),
    getBlob: vi.fn(),
    getRef: vi.fn(),
    getCommit: vi.fn(),
    createBlob: vi.fn(),
    createTree: vi.fn(),
    createCommit: vi.fn(),
    updateRef: vi.fn()
  },
  repos: {
    getPages: vi.fn(),
    createPagesSite: vi.fn(),
    updateInformationAboutPagesSite: vi.fn(),
    getContent: vi.fn(),
    createOrUpdateFileContents: vi.fn(),
    deleteFile: vi.fn()
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

    expect(octokitMock.actions.listWorkflowRunsForRepo).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      branch: "main",
      head_sha: "publish-sha",
      per_page: 20
    });
    expect(octokitMock.actions.getWorkflowRun).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      run_id: 2
    });
    expect(status).toBe("completed");
  });

  it("reports when no workflow run exists for the publish commit", async () => {
    octokitMock.actions.listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: {
        workflow_runs: [{ id: 1, head_sha: "other-sha", status: "completed", conclusion: "success" }]
      }
    });

    const client = new GitHubClient("installation-token");
    const status = await client.getWorkflowStatusForCommit(
      { owner: "owner", repo: "repo", branch: "main" },
      "publish-sha"
    );

    expect(octokitMock.actions.listWorkflowRunsForRepo).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      branch: "main",
      head_sha: "publish-sha",
      per_page: 20
    });
    expect(status).toBe("not_found");
    expect(octokitMock.actions.getWorkflowRun).not.toHaveBeenCalled();
  });

  it("falls back to contents writes when Git Data writes are blocked for normal content commits", async () => {
    octokitMock.git.getRef.mockResolvedValueOnce({ data: { object: { sha: "base-sha" } } });
    octokitMock.git.getCommit.mockResolvedValueOnce({ data: { tree: { sha: "tree-sha" } } });
    octokitMock.git.createBlob.mockResolvedValue({ data: { sha: "new-blob-sha" } });
    octokitMock.repos.getContent.mockRejectedValue({ status: 404 });
    octokitMock.git.createTree.mockRejectedValueOnce({
      status: 403,
      message: "Resource not accessible by integration"
    });
    octokitMock.repos.createOrUpdateFileContents.mockResolvedValue({
      data: { commit: { sha: "contents-sha" } }
    });

    const client = new GitHubClient("installation-token");
    const result = await client.executeCommit({
      owner: "owner",
      repo: "repo",
      branch: "main",
      message: "Publish blog",
      files: [{ path: "content/posts/hello.md", content: "# Hello", encoding: "utf-8" }]
    });

    expect(result.sha).toBe("contents-sha");
    expect(octokitMock.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        branch: "main",
        path: "content/posts/hello.md",
        message: "Publish blog"
      })
    );
  });

  it("reports missing Workflows permission when template setup cannot create the deploy workflow", async () => {
    octokitMock.git.getTree.mockResolvedValueOnce({
      data: {
        tree: [{ path: "templates/astro-blog/package.json", type: "blob", sha: "blob-sha" }]
      }
    });
    octokitMock.git.getBlob.mockResolvedValueOnce({
      data: { content: btoa("{}") }
    });
    octokitMock.git.getRef.mockResolvedValueOnce({ data: { object: { sha: "base-sha" } } });
    octokitMock.git.getCommit.mockResolvedValueOnce({ data: { tree: { sha: "tree-sha" } } });
    octokitMock.git.createBlob.mockResolvedValue({ data: { sha: "new-blob-sha" } });
    octokitMock.repos.getContent.mockRejectedValue({ status: 404 });
    octokitMock.git.createTree.mockRejectedValueOnce({
      status: 403,
      message: "Resource not accessible by integration"
    });
    octokitMock.repos.createOrUpdateFileContents.mockImplementation(({ path }) => {
      if (path === ".github/workflows/deploy.yml") {
        return Promise.reject({
          status: 403,
          message: "Workflow does not have write permission"
        });
      }
      return Promise.resolve({ data: { commit: { sha: "contents-sha" } } });
    });

    const client = new GitHubClient("installation-token");
    await expect(
      client.initializeAstroTemplate({
        owner: "owner",
        repo: "repo",
        branch: "main"
      })
    ).rejects.toThrow("Repository needs GitHub App Workflows permission");
  });

  it("commits a standalone tsconfig when initializing a user blog repo", async () => {
    octokitMock.git.getTree.mockResolvedValueOnce({
      data: {
        tree: [{ path: "templates/astro-blog/tsconfig.json", type: "blob", sha: "tsconfig-sha" }]
      }
    });
    octokitMock.git.getBlob.mockResolvedValueOnce({
      data: {
        content: btoa('{"extends":"../../tsconfig.base.json","include":["src"]}')
      }
    });
    octokitMock.git.getRef.mockResolvedValueOnce({ data: { object: { sha: "base-sha" } } });
    octokitMock.git.getCommit.mockResolvedValueOnce({ data: { tree: { sha: "tree-sha" } } });
    octokitMock.git.createBlob.mockResolvedValue({ data: { sha: "new-blob-sha" } });
    octokitMock.git.createTree.mockResolvedValueOnce({ data: { sha: "new-tree-sha" } });
    octokitMock.git.createCommit.mockResolvedValueOnce({ data: { sha: "commit-sha" } });
    octokitMock.git.updateRef.mockResolvedValueOnce({});

    const client = new GitHubClient("installation-token");
    await client.initializeAstroTemplate({
      owner: "owner",
      repo: "repo",
      branch: "main"
    });

    const createTreeCall = octokitMock.git.createTree.mock.calls[0]?.[0];
    const tsconfigEntry = createTreeCall.tree.find(
      (entry: { readonly path?: string }) => entry.path === "tsconfig.json"
    );

    expect(tsconfigEntry.content).toContain('"moduleResolution": "Bundler"');
    expect(tsconfigEntry.content).not.toContain("../../tsconfig.base.json");
  });

  it("does not try browser Contents fallback when Git Data cannot write a workflow file", async () => {
    octokitMock.git.getTree.mockResolvedValueOnce({
      data: {
        tree: [{ path: "templates/astro-blog/package.json", type: "blob", sha: "blob-sha" }]
      }
    });
    octokitMock.git.getBlob.mockResolvedValueOnce({
      data: { content: btoa("{}") }
    });
    octokitMock.git.getRef.mockResolvedValueOnce({ data: { object: { sha: "base-sha" } } });
    octokitMock.git.getCommit.mockResolvedValueOnce({ data: { tree: { sha: "tree-sha" } } });
    octokitMock.git.createBlob.mockResolvedValue({ data: { sha: "new-blob-sha" } });
    octokitMock.git.createTree.mockRejectedValueOnce({
      status: 403,
      message: "Resource not accessible by integration"
    });

    const client = new GitHubClient("installation-token");
    await expect(
      client.initializeAstroTemplate({
        owner: "owner",
        repo: "repo",
        branch: "main"
      })
    ).rejects.toThrow("Repository needs GitHub App Workflows permission");
    expect(octokitMock.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
  });

  it("retries Git Data commits when the branch moves before ref update", async () => {
    octokitMock.git.getRef
      .mockResolvedValueOnce({ data: { object: { sha: "old-base-sha" } } })
      .mockResolvedValueOnce({ data: { object: { sha: "new-base-sha" } } });
    octokitMock.git.getCommit
      .mockResolvedValueOnce({ data: { tree: { sha: "old-tree-sha" } } })
      .mockResolvedValueOnce({ data: { tree: { sha: "new-tree-sha" } } });
    octokitMock.git.createTree
      .mockResolvedValueOnce({ data: { sha: "first-tree-sha" } })
      .mockResolvedValueOnce({ data: { sha: "second-tree-sha" } });
    octokitMock.git.createCommit
      .mockResolvedValueOnce({ data: { sha: "first-commit-sha" } })
      .mockResolvedValueOnce({ data: { sha: "second-commit-sha" } });
    octokitMock.git.updateRef
      .mockRejectedValueOnce({ status: 422, message: "Update is not a fast forward" })
      .mockResolvedValueOnce({});

    const client = new GitHubClient("installation-token");
    const result = await client.executeCommit({
      owner: "owner",
      repo: "repo",
      branch: "main",
      message: "publish: retry",
      files: [{ path: "content/posts/retry.md", content: "# Retry", encoding: "utf-8" }]
    });

    expect(result.sha).toBe("second-commit-sha");
    expect(octokitMock.git.updateRef).toHaveBeenCalledTimes(2);
    expect(octokitMock.git.getRef).toHaveBeenCalledTimes(2);
  });
});
