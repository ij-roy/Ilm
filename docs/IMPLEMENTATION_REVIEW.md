# Ilm Implementation Review

Version: 1.0

---

# Purpose

This document records the implementation review performed before production code begins.

The source documents were reviewed together:

- PRD.md
- ARCHITECTURE.md
- TECH_STACK.md
- UI_UX.md
- IMPLEMENTATION.md

The review also applies the approved architecture revision that makes Ilm a CMS-only repository and keeps the user's blog repository independent.

---

# Review Result

The product direction is consistent:

- Ilm is a GitHub-first CMS.
- GitHub remains the long-term source of truth.
- The generated website is static.
- User content is Markdown with frontmatter.
- Media is stored in the user's repository.
- There is no traditional backend or database.
- AI is optional and uses user-owned keys.
- Analytics data remains user-owned.

The original documents had structural ambiguity around whether the blog template lived inside the Ilm repository. That ambiguity is now resolved.

Ilm is not a blog repository.

Ilm manages an external GitHub repository that belongs to the user.

---

# Resolved Architecture Decisions

## Ilm Repository Scope

The Ilm repository contains:

- CMS application.
- GitHub authentication worker.
- Shared packages.
- Infrastructure scripts.
- Starter templates.
- Documentation.

The Ilm repository does not contain:

- A live blog application.
- User content.
- User media.
- User publishing configuration.

`apps/blog` is removed from the architecture.

## Authentication Worker

The GitHub App authentication worker belongs under:

```text
workers/
  github-auth/
```

The worker is infrastructure, not an application.

It must remain stateless and database-free.

## User Blog Repository

The user blog repository is external and user-owned.

Canonical structure:

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

The static site generator adapts to this structure.

User content never adapts to Ilm internals.

## Content Metadata

Tags, categories, series, and authors are frontmatter metadata, not folders.

Example:

```yaml
---
title:
tags:
categories:
series:
author:
---
```

## Media

Media folders are explicit:

- `media/images`
- `media/covers`
- `media/attachments`

Generic `assets` folders are avoided for user-managed media.

## Configuration

Configuration uses TypeScript files:

- `config/site.ts`
- `config/seo.ts`
- `config/navigation.ts`

This supports type safety, autocomplete, validation, and template-readable build-time configuration.

## Package Naming

`packages/repository` is the canonical package for the external user repository contract.

It owns:

- Repository layout constants.
- Typed config contracts.
- Frontmatter schemas.
- Post and draft path planning.
- Media path planning.
- Repository verification rules.

It does not own GitHub transport or commit planning.

`packages/github` owns GitHub API access.

`packages/publishing` owns commit manifests, draft-save planning, publish planning, conflict recovery models, and publish progress state.

## Templates

Templates live under:

```text
templates/
  astro-blog/
```

Templates are starter source for external user-owned repositories.

Astro is the first supported template, not an embedded Ilm app.

Future templates can be added beside it without moving user content.

---

# Risk Review

## Security

Risks:

- OAuth token leakage.
- AI API key leakage.
- Overly broad GitHub permissions.
- Secrets accidentally committed to user repositories.

Required mitigations:

- Use a stateless GitHub auth worker to prepare GitHub App installation-token requests.
- Keep secrets session-only by default.
- Encrypt optional persisted AI keys with Web Crypto.
- Never log credentials.
- Provide a clear credential revoke and clear flow.
- Request minimum repository permissions.

## Scalability

Risks:

- Large media libraries.
- GitHub API rate limits.
- Search index growth.
- Slow repository verification for large repositories.

Required mitigations:

- Keep media paths deterministic.
- Batch GitHub reads where practical.
- Use GitHub API retry and throttling behavior.
- Generate search at build time.
- Keep CMS state derived from repository indexes and file metadata where possible.

## Maintainability

Risks:

- Coupling CMS logic to Astro.
- Mixing GitHub transport with repository layout rules.
- Mixing publishing workflow planning with repository layout rules.
- Creating feature logic before the contract is stable.

Required mitigations:

- Keep template-specific logic inside templates.
- Keep repository contract in `packages/repository`.
- Keep commit planning and publish orchestration in `packages/publishing`.
- Keep GitHub transport in `packages/github`.
- Validate repository shape before editor and publishing features rely on it.

## UX

Risks:

- Writing interrupted by network latency.
- Draft data loss.
- Confusing repository setup.
- Publishing errors without recovery actions.

Required mitigations:

- Use IndexedDB for immediate local draft recovery.
- Provide explicit Save Draft to GitHub.
- Never create automatic commits while typing.
- Show actionable repository validation errors.
- Show publish progress and recovery options.

---

# Implementation Blockers

No blocker remains for the first implementation milestone.

No `QUESTIONS.md` is required at this time.

Future implementation must stop and ask before changing any documented architectural decision.
