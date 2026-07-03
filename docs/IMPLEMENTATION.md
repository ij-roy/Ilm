# Ilm - Implementation Plan

Version: 1.0

---

# Purpose

This document defines how Ilm should be implemented.

It is written for an AI coding agent.

The goal is to ensure implementation remains consistent with the PRD, Architecture, Tech Stack, UI/UX specification, Implementation Review, and Project Structure documents.

The coding agent should never invent functionality outside these documents.

If implementation conflicts with the documentation, the documentation takes precedence.

---

# Core Principles

Every implementation decision must satisfy these principles:

- Simplicity over cleverness.
- Readability over brevity.
- Composition over inheritance.
- Type safety everywhere.
- Accessibility by default.
- Performance first.
- SEO first.
- User ownership above all else.
- Avoid unnecessary abstractions.
- Avoid premature optimization.

---

# Development Strategy

Ilm should be implemented as a small number of product milestones, not as many artificial phases.

Each milestone must deliver meaningful working software and include the modules needed for that user journey.

The implementation order is optimized around the product flow:

1. Connect a user-owned repository.
2. Write and safely save content.
3. Publish and operate the static site.

---

# Implementation Milestones

## Milestone 1 - Platform Spine

Implement:

- Monorepo structure
- Package management
- TypeScript configuration
- ESLint
- Prettier
- Tailwind CSS
- shadcn/ui
- `apps/cms`
- Application shell
- Routing
- Sidebar
- Layout
- Theme
- Settings
- Global state
- Error boundaries
- Loading states
- Production empty states
- `workers/github-auth`
- GitHub authentication
- GitHub auth worker integration
- Repository selection
- Session persistence
- Logout
- Route protection
- `packages/repository`
- External user repository verification
- Canonical user repository layout
- TypeScript config contracts
- Frontmatter schemas
- Post and draft path planning
- Media path planning
- `packages/github`
- `templates/astro-blog`
- GitHub Actions for linting, typechecking, testing, and building

Deliverable:

A user can authenticate, select an external GitHub repository, verify its structure, and see real repository status in a runnable CMS shell.

---

## Milestone 2 - Authoring Workspace

Implement:

- TipTap integration
- Toolbar
- Slash commands
- Markdown serialization
- IndexedDB local draft recovery
- Explicit Save Draft to GitHub
- `packages/publishing` draft-save planning
- Draft save commit manifests
- Word count
- Reading time
- Outline generation
- Keyboard shortcuts
- Drag-and-drop upload
- Clipboard paste
- Cover image selection
- Media library
- Image optimization
- WebP conversion
- Alt text management
- Attachments
- Slug generation
- Meta title
- Meta description
- Canonical URL
- Open Graph
- Twitter Cards
- JSON-LD
- SEO score
- Suggestions panel
- BYOK configuration
- Session-only default keys
- Optional encrypted local key persistence
- Provider abstraction
- Grammar fixes
- Rewrite
- Summaries
- Tags
- Categories
- Internal links
- Social posts

Deliverable:

A user can write a rich article, recover local work, manage media, improve content with AI, validate SEO, and explicitly save a GitHub draft without automatic commit spam.

---

## Milestone 3 - Publish And Operate

Implement:

- `packages/publishing` full publish planning
- Publish validation orchestration
- Publish commit manifests
- Draft-to-post transition planning
- Media inclusion planning
- Conflict recovery models
- Publish progress state
- Markdown generation
- Frontmatter generation
- Media organization
- GitHub commit
- Push
- Publish status
- Error recovery
- GitHub Actions status
- Build-time search indexing
- Search UI
- Filters
- Keyboard navigation
- Google Analytics integration
- Google Search Console integration
- Dashboard cards
- Performance overview
- Animations
- Accessibility improvements
- Empty states
- Error states
- Skeleton loaders
- Responsive layouts
- Performance optimization

Deliverable:

A first-time user can connect GitHub, create a post, paste images, improve content with AI, preview, publish, and see deployment status without manually touching Git, Markdown files, SEO configuration, or GitHub Actions.

---

# Package Responsibilities

```text
apps/
  cms/                -> Main CMS application

workers/
  github-auth/        -> Stateless GitHub OAuth infrastructure

packages/
  ui/                 -> Shared UI components
  editor/             -> TipTap configuration and editor helpers
  repository/         -> User repository contract
  github/             -> GitHub API transport
  publishing/         -> Publishing workflow and commit planning
  seo/                -> SEO generation and validation
  ai/                 -> AI provider abstraction
  media/              -> Media processing and metadata
  analytics/          -> User-owned analytics integrations
  shared/             -> Shared utilities

templates/
  astro-blog/         -> Starter template for external user blog repositories

docs/
scripts/
```

Each package should have a single responsibility.

The Ilm repository must not contain a live blog application or user content.

---

# Package Boundaries

## `packages/repository`

Owns only:

- Repository structure
- Repository validation
- Path generation
- Frontmatter schemas
- Typed config schemas
- Post and draft models
- Media path planning

It must not own commit manifests, publish workflow planning, or GitHub API transport.

## `packages/publishing`

Owns:

- Publish validation orchestration
- Draft-save planning
- Publish planning
- Commit manifests
- Draft-to-post transition planning
- Media inclusion planning for write operations
- Conflict recovery models
- Publish progress state
- Publish results

`packages/publishing` may depend on repository, SEO, media, editor, and GitHub abstractions.

## `packages/github`

Owns:

- Auth-aware GitHub API clients
- Repository listing
- Repository file reads
- Repository file writes
- Commit execution
- Branch data
- GitHub Actions status
- Rate-limit and authentication errors

It executes publishing plans but does not decide which files belong in a draft-save or publish commit.

---

# Public Interfaces

`@ilm/repository` should expose:

- `RepositoryLayout`
- `validateRepositoryStructure`
- `buildPostPath`
- `buildDraftPath`
- `buildMediaPath`
- `PostFrontmatterSchema`
- `DraftFrontmatterSchema`
- `SiteConfigSchema`
- `SeoConfigSchema`
- `NavigationConfigSchema`
- `Post`
- `Draft`
- `MediaLocation`

`@ilm/publishing` should expose:

- `DraftSavePlan`
- `PublishPlan`
- `CommitManifest`
- `createDraftSavePlan`
- `createPublishPlan`
- `validatePublishPlan`
- `PublishProgress`
- `PublishConflict`
- `PublishResult`

`@ilm/github` should expose GitHub transport APIs that can execute commit-like inputs created by `@ilm/publishing`.

---

# Version Policy

Do not hardcode runtime or framework versions in architecture documents.

Use:

- The current Active LTS Node release.
- The latest stable pnpm version via Corepack.
- The latest compatible stable framework and tooling versions during implementation.

Exact resolved versions belong only in `package.json` files and the lockfile.

---

# Coding Standards

- TypeScript strict mode.
- Functional React components only.
- Hooks over class components.
- No duplicated logic.
- Small reusable components.
- Descriptive naming.
- Consistent folder organization.
- Avoid `any`.
- Prefer composition.

---

# Error Handling

Every async operation must handle:

- Loading
- Success
- Failure
- Retry

Never fail silently.

Display actionable error messages.

---

# State Management

Use local state where possible.

Use shared/global state only when necessary.

Avoid unnecessary complexity.

---

# Performance Guidelines

- Lazy-load heavy modules.
- Memoize expensive computations when needed.
- Optimize images.
- Avoid unnecessary re-renders.
- Keep bundles small.
- Use code splitting.

Performance should be measured, not guessed.

---

# Accessibility Checklist

Every screen must support:

- Keyboard navigation.
- Screen readers.
- Focus management.
- Semantic HTML.
- Visible focus indicators.
- Color contrast.

Accessibility is a requirement, not a future enhancement.

---

# Security Guidelines

- Never expose secrets.
- Validate all inputs.
- Sanitize rendered content.
- Request minimum GitHub permissions.
- Handle authentication failures gracefully.
- Never commit credentials to Git.
- Never silently persist credentials.

---

# Git Strategy

- Small, focused commits.
- Conventional commit messages.
- Feature branches.
- Pull requests for major changes.

---

# Quality Gates

Before any milestone is considered complete:

- Builds successfully.
- Typechecks successfully.
- Lints successfully.
- Passes tests.
- Accessible.
- Responsive.
- Meets performance expectations.
- Matches the UI/UX specification.
- Matches the PRD.
- Preserves the Ilm/user repository boundary.

---

# Test Plan

`@ilm/repository` tests must prove repository validation and path generation work without importing publishing or GitHub code.

`@ilm/publishing` tests must prove draft-save and publish plans produce correct commit manifests using repository, media, SEO, and editor inputs.

`@ilm/github` tests must prove commit execution consumes publishing output without owning publish decisions.

Integration tests must cover Save Draft, Publish, conflict recovery, and GitHub Actions status.

End-to-end tests must cover the full first-time user journey from GitHub connection through publish/deploy status.

---

# Done Criteria

A milestone is complete only if:

- It fulfills its documented requirements.
- It integrates with the rest of the application.
- It has appropriate error handling.
- It is maintainable.
- It introduces no regressions.
- It passes all quality gates.

---

# Instructions for Codex

1. Read all documents in the `docs/` directory before writing code.
2. Treat the documentation as the authoritative specification.
3. Do not invent new features.
4. Do not remove documented features.
5. If documentation conflicts, stop and report the conflict instead of guessing.
6. Build the project milestone by milestone, ensuring each milestone is functional before proceeding.
7. Keep the codebase modular, well-typed, and easy to maintain.
8. Favor clear, production-ready code over clever implementations.
9. Keep commit planning in `@ilm/publishing`, not `@ilm/repository`.

---

# Final Principle

Codex is responsible for implementation, not product design.

All product decisions are defined in the documentation.

The implementation should faithfully translate those decisions into a maintainable, production-quality codebase while preserving Ilm's core philosophy:

> Write once. Own forever.
