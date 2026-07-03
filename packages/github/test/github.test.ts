import { describe, expect, it } from "vitest";
import { LocalGitHubClient, manifestToCommitRequest } from "../src/index";

describe("@ilm/github", () => {
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

    expect(repositories[0]?.fullName).toBe("local/ilm-starter");
    expect(result.fileCount).toBe(1);
    expect(result.sha).toMatch(/[0-9a-f]+/);
  });
});
