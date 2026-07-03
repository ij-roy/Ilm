# ARCHITECTURE.md

# Ilm – System Architecture

Version: 1.0

---

# Purpose

This document defines the complete high-level architecture of Ilm.

Ilm is an open-source Git-native publishing tool whose primary objective is to provide an exceptional writing experience while keeping the user's content entirely under their ownership.

GitHub is the source of truth.

The generated website is static.

Ilm itself is the CMS and supporting infrastructure only.

The user's blog lives in a separate GitHub repository owned by the user.

The architecture must prioritize:

- Simplicity
- Ownership
- Performance
- Maintainability
- Technical SEO
- Zero vendor lock-in
- Near-zero operating cost

---

# High-Level Architecture

```text
                 User

                  │

                  ▼

         Ilm (React Application)

                  │

      ┌───────────┼────────────┐

      ▼           ▼            ▼

 Rich Editor   AI Layer    Media Manager

      │           │            │

      └───────────┼────────────┘

                  ▼

         Publishing Engine

                  │

                  ▼

            GitHub API

                  │

                  ▼

         GitHub Repository

                  │

                  ▼

          GitHub Actions

                  │

                  ▼

        Static Site Generator

                  │

                  ▼

          GitHub Pages

                  │

                  ▼

      Google / Bing / AI Crawlers
```

---

# Major Components

## Repository Boundary

Ilm and the user's blog repository must remain independent.

Ilm repository:

- Contains the CMS application.
- Contains infrastructure workers.
- Contains reusable packages.
- Contains starter templates.
- Does not contain a live user blog.
- Does not contain user content.

User blog repository:

- Belongs to the user.
- Stores content, media, configuration, metadata, and generated site source.
- Is understandable without knowing Ilm internals.
- Uses one source of truth for posts, drafts, media, and configuration.
- Can replace the static site generator with minimal content migration.

Templates adapt to the user repository structure.

The user repository must never adapt to Ilm's internal package layout.

---

## 1. Application Shell

Responsible for:

- Authentication
- Routing
- Theme
- Global state
- Settings
- User preferences

The shell contains no publishing logic.

---

## 2. Editor Engine

Primary responsibility:

Writing.

Features:

- Rich text editing
- Automatic Markdown generation
- Autosave
- Slash commands
- Drag & drop
- Clipboard images
- Keyboard shortcuts
- Live preview

The editor is the heart of Ilm.

Users should rarely interact with raw Markdown.

---

## 3. AI Layer

The AI layer never owns content.

Its purpose is to assist.

Responsibilities:

- Grammar
- Rewrite
- SEO suggestions
- Summaries
- Titles
- Tags
- Categories
- Internal links
- Social posts

AI is optional.

Users provide their own API keys.

---

## 4. Media Manager

Responsible for:

- Image uploads
- Compression
- WebP conversion
- Cover images
- Media library
- Media file organization

Media is stored inside the Git repository.

---

## 5. SEO Engine

Automatically generates:

- Frontmatter
- Reading time
- Meta description
- Canonical URL
- Open Graph
- Twitter Cards
- JSON-LD
- Slugs

The user may edit these values before publishing.

---

## 6. Publishing Engine

The publishing engine is the core automation layer.

Responsibilities:

- Validate content
- Serialize to Markdown
- Organize media
- Plan publish commits
- Create Git commit
- Push to GitHub
- Trigger deployment

Publishing should require one click.

---

## 7. GitHub Integration

GitHub is the database.

Responsibilities:

- Authentication
- Repository access
- Read posts
- Create posts
- Update posts
- Delete posts
- Upload media
- Commit changes

No traditional database exists.

---

## 8. Static Site

The generated blog is completely static.

Responsibilities:

- Display content
- Fast loading
- SEO
- Search
- RSS
- Sitemap

The CMS never serves the blog.

---

# Content Flow

```text
Write

↓

Autosave

↓

Preview

↓

SEO Validation

↓

AI Improvements (Optional)

↓

Publish

↓

Markdown Generated

↓

Images Optimized

↓

Git Commit

↓

GitHub Push

↓

GitHub Actions

↓

Build

↓

Deploy

↓

Website Updated
```

---

# Data Flow

```text
Editor

↓

Document Model

↓

Markdown

↓

Git Repository

↓

Build

↓

HTML

↓

Visitor
```

---

# Repository Structure

The canonical user blog repository structure is:

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

Tags, categories, series, and author data are frontmatter metadata, not filesystem entities.

Example post frontmatter:

```yaml
---
title:
tags:
categories:
series:
author:
---
```

The user blog repository is always the source of truth.

Ilm writes to the user repository through GitHub APIs.

Ilm does not mirror, duplicate, or synchronize content into an Ilm-owned blog app.

---

# Build Pipeline

Publishing triggers:

1. Git Commit
2. Git Push
3. GitHub Actions
4. Static Site Build
5. Sitemap Generation
6. RSS Generation
7. Search Index Generation
8. Deployment

Ilm should not generate these manually.

The build process should.

---

# Search Architecture

Search should be static.

Pipeline:

Posts

↓

Build

↓

Generate Search Index

↓

Client-side Search

No server required.

---

# Analytics

Ilm does not collect analytics.

Instead it integrates with:

- Google Analytics
- Google Search Console

Users own all analytics accounts.

---

# AI Architecture

```text
Editor

↓

Selected Text

↓

AI Provider

↓

Suggestion

↓

User Approval

↓

Editor
```

AI never changes content without explicit approval.

---

# Authentication

Preferred flow:

GitHub Authentication

↓

Repository Authorization

↓

Token Storage

↓

API Access

Only the minimum required permissions should be requested.

---

# Error Handling

Publishing failures should never lose content.

Every stage should report:

- Success
- Failure
- Retry options

Examples:

- Image upload failed
- GitHub unavailable
- Build failed
- Authentication expired

---

# Security Principles

- Principle of least privilege
- Secure token storage
- No plaintext secrets
- No unnecessary permissions
- Validate all user input
- Sanitize generated Markdown

---

# Performance Principles

The generated website should prioritize:

- Core Web Vitals
- Minimal JavaScript
- Optimized images
- Lazy loading
- Semantic HTML
- Static rendering

---

# Scalability

Although Ilm is initially designed for personal blogs, the architecture should support:

- Hundreds of posts
- Thousands of media files
- Multiple repositories (future)
- Multiple themes (future)

without major architectural changes.

---

# Architectural Decisions

| Decision                        | Reason                                                                     |
| ------------------------------- | -------------------------------------------------------------------------- |
| GitHub as source of truth       | Users own everything                                                       |
| Markdown storage                | Portable, future-proof, Git-friendly                                       |
| Static site output              | Fast, secure, SEO-friendly                                                 |
| Rich editor                     | Better writing experience                                                  |
| AI is optional                  | Avoid vendor lock-in and recurring costs                                   |
| Build-time SEO generation       | Simpler architecture                                                       |
| Build-time search indexing      | No backend required                                                        |
| User-owned analytics            | Preserve ownership philosophy                                              |
| Publishing owns commit planning | Commit manifests are workflow artifacts, not repository-contract artifacts |

---

# Guiding Architectural Principle

Every architectural decision should answer one question:

> **Does this make publishing easier while preserving complete ownership of the user's content?**

If the answer is no, the decision should be reconsidered.
