import { expect, test } from "@playwright/test";

test("renders the Ilm CMS shell", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();

  await page.getByRole("link", { name: "Editor" }).click();
  await expect(page.getByRole("heading", { name: "Connect GitHub" })).toBeVisible();
  await expect(page.getByText("Authenticate before opening Editor.").first()).toBeVisible();
});

test("shows setup for a connected repository without a static site", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "ilm.auth.session",
      JSON.stringify({
        userToken: "user-token",
        installationId: "9876",
        accessToken: "installation-token",
        accessTokenExpiresAt: "2099-01-01T00:00:00.000Z"
      })
    );
    window.localStorage.setItem(
      "ilm.cms.state.v1",
      JSON.stringify({
        repository: {
          owner: "ij-roy",
          repo: "ilm-test-blog",
          branch: "main",
          fullName: "ij-roy/ilm-test-blog"
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
        siteUrl: ""
      })
    );
  });

  await page.route("https://api.github.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/git/trees/")) {
      await route.fulfill({
        json: {
          tree: [
            { path: "content/posts", type: "tree" },
            { path: "content/drafts", type: "tree" },
            { path: "media/images", type: "tree" },
            { path: "media/covers", type: "tree" },
            { path: "media/attachments", type: "tree" },
            { path: "config", type: "tree" },
            { path: "config/site.ts", type: "blob" },
            { path: "config/seo.ts", type: "blob" },
            { path: "config/navigation.ts", type: "blob" },
            { path: "site/astro", type: "tree" },
            { path: ".github/workflows", type: "tree" }
          ]
        }
      });
      return;
    }
    if (url.includes("/contents/config/seo.ts")) {
      await route.fulfill({ json: { content: btoa("export const seoConfig = {};") } });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto("/editor");

  await expect(page.getByRole("heading", { name: "Editor", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review Setup Changes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up site to publish" })).toBeDisabled();
});

test("shows live blog destination for a repository with GitHub Pages", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "ilm.auth.session",
      JSON.stringify({
        userToken: "user-token",
        installationId: "9876",
        accessToken: "installation-token",
        accessTokenExpiresAt: "2099-01-01T00:00:00.000Z"
      })
    );
    window.localStorage.setItem(
      "ilm.cms.state.v1",
      JSON.stringify({
        repository: {
          owner: "ij-roy",
          repo: "ilm-test-blog",
          branch: "main",
          fullName: "ij-roy/ilm-test-blog"
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
        siteHomeUrl: "https://ij-roy.github.io/ilm-test-blog/"
      })
    );
  });

  await page.route("https://api.github.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/git/trees/")) {
      await route.fulfill({
        json: {
          tree: [
            { path: "package.json", type: "blob" },
            { path: "astro.config.mjs", type: "blob" },
            { path: "content/posts", type: "tree" },
            { path: "content/drafts", type: "tree" },
            { path: "media/images", type: "tree" },
            { path: "media/covers", type: "tree" },
            { path: "media/attachments", type: "tree" },
            { path: "config", type: "tree" },
            { path: "config/site.ts", type: "blob" },
            { path: "config/seo.ts", type: "blob" },
            { path: "config/navigation.ts", type: "blob" },
            { path: "src/pages/blogs/[slug].astro", type: "blob" },
            { path: ".github/workflows", type: "tree" },
            { path: ".github/workflows/deploy.yml", type: "blob" }
          ]
        }
      });
      return;
    }
    if (url.includes("/contents/")) {
      await route.fulfill({ json: { content: btoa("export const seoConfig = {};") } });
      return;
    }
    if (url.includes("/pages")) {
      await route.fulfill({
        json: {
          html_url: "https://ij-roy.github.io/ilm-test-blog/",
          status: "built",
          build_type: "workflow"
        }
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto("/editor");

  await expect(page.getByText("Live blog URL")).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "https://ij-roy.github.io/ilm-test-blog/blog/own-your-publishing-workflow/"
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish/ })).toBeVisible();
});
