import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";

describe("@ilm/cms", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders protected dashboard with a polished GitHub connect setup when signed out", () => {
    window.history.pushState({}, "Test", "/dashboard");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByText("Git-native publishing")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect GitHub" })).toBeInTheDocument();
    expect(
      screen.getByText("Connect GitHub → Select Repository → Ready to Publish")
    ).toBeInTheDocument();
  });

  it("protects editor route before authentication", () => {
    window.history.pushState({}, "Test", "/editor");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Connect GitHub" })).toBeInTheDocument();
    expect(screen.getAllByText("Authenticate before opening Editor.").length).toBeGreaterThan(0);
  });

  it("accepts callback tokens only when the OAuth nonce matches", async () => {
    window.sessionStorage.setItem("ilm.auth.pendingState", "nonce-123");
    window.history.pushState(
      {},
      "Test",
      "/dashboard#user_token=user-token&installation_id=77&state=nonce-123"
    );

    render(<App />);

    expect(await screen.findByText("Choose a repository...")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("ilm.auth.session")).toContain("user-token");
    expect(window.localStorage.getItem("ilm.cms.state.v1")).not.toContain("user-token");
  });

  it("rejects callback tokens when the OAuth nonce does not match", () => {
    window.sessionStorage.setItem("ilm.auth.pendingState", "nonce-expected");
    window.history.pushState(
      {},
      "Test",
      "/dashboard#user_token=user-token&installation_id=77&state=nonce-wrong"
    );

    render(<App />);

    expect(screen.getAllByText("GitHub session could not be verified.").length).toBeGreaterThan(0);
    expect(window.sessionStorage.getItem("ilm.auth.session")).toBeNull();
  });

  it("shows an expired session recovery state", () => {
    window.sessionStorage.setItem(
      "ilm.auth.session",
      JSON.stringify({
        userToken: "user-token",
        installationId: "77",
        accessToken: "expired-token",
        accessTokenExpiresAt: "2020-01-01T00:00:00.000Z"
      })
    );
    window.history.pushState({}, "Test", "/dashboard");

    render(<App />);

    expect(screen.getByText("Session expired. Reconnect to continue.")).toBeInTheDocument();
  });

  it("requires static site setup before publishing from a connected repository", async () => {
    seedConnectedRepositorySession();
    window.history.pushState({}, "Test", "/editor");
    vi.stubGlobal("fetch", createRepositoryFetchMock([]));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Editor" })).toBeInTheDocument();
    expect((await screen.findAllByText("Set Up Blog Site")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Set up site to publish" })).toBeDisabled();
  });

  it("shows the verified live post URL after publishing", async () => {
    seedConnectedRepositorySession({ siteHomeUrl: "https://owner.github.io/repo/" });
    window.history.pushState({}, "Test", "/editor");
    vi.stubGlobal("fetch", createRepositoryFetchMock(["package.json", "astro.config.mjs"]));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Editor" })).toBeInTheDocument();
    expect(await screen.findByText("Live post URL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://owner.github.io/repo/posts/own-your-publishing-workflow/" })).toBeInTheDocument();
  });
});

function seedConnectedRepositorySession(overrides: Record<string, unknown> = {}) {
  window.sessionStorage.setItem(
    "ilm.auth.session",
    JSON.stringify({
      userToken: "user-token",
      installationId: "77",
      accessToken: "installation-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z"
    })
  );
  window.localStorage.setItem(
    "ilm.cms.state.v1",
    JSON.stringify({
      repository: {
        owner: "owner",
        repo: "repo",
        branch: "main",
        fullName: "owner/repo"
      },
      activeDraft: {
        id: "draft-local",
        title: "Own your publishing workflow",
        slug: "own-your-publishing-workflow",
        description: "A practical note about writing and publishing.",
        author: "Ilm Author",
        tags: "cms",
        categories: "engineering",
        markdown: "# Own your publishing workflow",
        updatedAt: new Date().toISOString()
      },
      drafts: [],
      posts: [],
      media: [],
      events: [],
      geminiApiKey: "",
      geminiEncryptedKey: "",
      googleAnalyticsId: "",
      siteUrl: "",
      ...overrides
    })
  );
}

function createRepositoryFetchMock(paths: readonly string[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "object" && input !== null && "url" in input
        ? String((input as { readonly url: string }).url)
        : String(input);
    if (url.includes("/git/trees/")) {
      return new Response(
        JSON.stringify({
          tree: paths.map((path) => ({
            path,
            type: path.includes(".") ? "blob" : "tree"
          }))
        }),
        { status: 200 }
      );
    }
    if (url.includes("/contents/")) {
      return new Response(JSON.stringify({ content: btoa("export const seoConfig = {};") }), {
        status: 200
      });
    }
    if (url.includes("/pages")) {
      return new Response(
        JSON.stringify({
          html_url: "https://owner.github.io/repo/",
          status: "built",
          build_type: "workflow"
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}
