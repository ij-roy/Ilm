import { describe, expect, it } from "vitest";
import { getPublishedPosts } from "../src/template/posts";

describe("@ilm/astro-blog-template", () => {
  it("reads published posts from the template content directory", async () => {
    const posts = await getPublishedPosts();

    expect(posts[0]?.slug).toBe("welcome-to-ilm");
  });
});
