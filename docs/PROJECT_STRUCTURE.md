# Ilm Project Structure

Version: 1.0

---

# Purpose

This document defines the final repository structure for Ilm and the canonical structure for user-owned blog repositories managed by Ilm.

The key boundary is:

```text
Ilm CMS Repository
  |
  v
Connects to
  |
  v
User-owned Blog Repository
```

The two repositories are independent.

---

# Ilm CMS Repository

```text
apps/
  cms/

workers/
  github-auth/

packages/
  ui/
  editor/
  repository/
  github/
  publishing/
  seo/
  ai/
  media/
  analytics/
  shared/

templates/
  astro-blog/

docs/
scripts/
.github/
```

## Responsibilities

`apps/cms`

The React CMS application. It owns routing, application shell, editor surfaces, settings, dashboard, publishing UI, and user workflows.

`workers/github-auth`

The stateless Cloudflare Worker used for GitHub OAuth exchange. It is infrastructure, not an application.

`packages/ui`

Shared shadcn/ui and Radix-based components, styling utilities, layout primitives, and accessible UI patterns.

`packages/editor`

TipTap configuration, editor extensions, Markdown serialization, outline extraction, reading time, word count, keyboard shortcuts, and local draft state helpers.

`packages/repository`

The canonical user repository contract. It defines layout constants, typed config contracts, frontmatter schemas, repository verification, path generation, draft/post state, and media path planning.

`packages/github`

GitHub API transport. It handles auth-aware API clients, repository listing, file reads, file writes, commit execution, branch data, and GitHub Actions status.

`packages/publishing`

Publishing workflow orchestration. It owns draft-save planning, publish planning, commit manifests, draft-to-post transition planning, media inclusion planning, conflict recovery models, publish progress state, and publish results.

`packages/seo`

SEO metadata generation and validation, including slugs, canonical URLs, Open Graph data, Twitter card data, JSON-LD, reading time integration, and SEO scoring.

`packages/ai`

BYOK provider abstraction for OpenAI, Anthropic, and Google Gemini. AI suggestions must require user approval before modifying editor content.

`packages/media`

Media validation, image metadata, image optimization contracts, WebP conversion orchestration, alt text, captions, cover image handling, and media library models.

`packages/analytics`

Google Analytics and Google Search Console integration adapters. Analytics credentials and data remain user-owned.

`packages/shared`

Shared TypeScript utilities, result types, errors, environment helpers, constants, and cross-package primitives.

`templates/astro-blog`

Starter template source for external user-owned repositories. It is not an app in the Ilm repository and must not store live user content.

---

# User Blog Repository

```text
content/
  posts/
  drafts/

media/
  images/
  covers/
  attachments/

config/
  site.ts
  seo.ts
  navigation.ts

site/
  astro/

.github/
  workflows/
```

## Responsibilities

`content/posts`

Published Markdown posts with frontmatter.

`content/drafts`

Draft Markdown posts with frontmatter. Drafts are saved to GitHub only through explicit Save Draft actions.

`media/images`

Inline and general article images.

`media/covers`

Post cover images.

`media/attachments`

Downloadable or embedded non-image files.

`config/site.ts`

Typed site-level configuration such as site title, description, URL, author defaults, locale, and social links.

`config/seo.ts`

Typed SEO defaults such as default meta description, Open Graph defaults, robots policy, canonical base URL, and structured data defaults.

`config/navigation.ts`

Typed navigation configuration for header, footer, and content discovery links.

`site/astro`

The Astro implementation for the static website. This code reads from the top-level content, media, and config directories.

`.github/workflows`

GitHub Actions workflows for build, SEO artifact generation, search indexing, and GitHub Pages deployment.

---

# Content Contract

Posts and drafts use Markdown with frontmatter.

Metadata is stored in frontmatter, not in metadata folders.

Required frontmatter fields for publishable posts:

```yaml
---
title:
description:
slug:
publishedAt:
updatedAt:
tags:
categories:
series:
author:
coverImage:
coverAlt:
---
```

Drafts may omit publish-only fields until validation before publishing.

The CMS must validate frontmatter before publishing.

---

# Template Contract

Templates must:

- Read content from `content/posts`.
- Ignore unpublished drafts in `content/drafts`.
- Read media from `media/images`, `media/covers`, and `media/attachments`.
- Read TypeScript config from `config/site.ts`, `config/seo.ts`, and `config/navigation.ts`.
- Generate RSS, sitemap, robots.txt, JSON-LD, Open Graph metadata, Twitter cards, and Pagefind search index at build time.
- Deploy static output through GitHub Pages by default.

Templates must not:

- Require user content to move into framework-specific directories.
- Duplicate content into generated source directories.
- Require an Ilm runtime to serve the public blog.
- Store secrets in repository files.

---

# Implementation Milestones

1. Platform Spine: foundation, CMS shell, auth worker, GitHub auth, repository selection, `packages/repository`, `packages/github`, repository validation, and the external Astro template contract.
2. Authoring Workspace: editor, local draft recovery, explicit Save Draft, media manager, SEO engine, AI integrations, and the first `packages/publishing` draft-save planning behavior.
3. Publish And Operate: full `packages/publishing` publish planning, commit manifests, conflict recovery, publish progress, GitHub Actions status, search, analytics, accessibility, responsive QA, performance hardening, and production readiness.

Each milestone must build, typecheck, lint, and pass relevant tests before the next milestone begins.
