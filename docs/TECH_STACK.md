# TECH_STACK.md

# Ilm – Technology Stack

Version: 1.0

---

# Purpose

This document defines the complete technology stack for Ilm.

Every technology choice is based on the following principles:

- Free to use
- Open source
- Modern developer experience
- Long-term maintainability
- Performance
- Excellent SEO
- Zero vendor lock-in
- Minimal infrastructure
- AI-friendly architecture

The goal is **not** to use the newest technology.

The goal is to use technologies that are mature, stable, widely adopted, and likely to remain relevant for many years.

---

# Core Architecture

| Layer           | Technology                       | Why                                             |
| --------------- | -------------------------------- | ----------------------------------------------- |
| Language        | TypeScript                       | Type safety, maintainability, excellent tooling |
| Runtime         | Node.js (development/build only) | Required by the frontend ecosystem              |
| Package Manager | pnpm                             | Fast, disk-efficient, workspace support         |
| Monorepo        | Turborepo                        | Clean project organization and scalable builds  |
| Version Control | Git                              | Source of truth                                 |
| Repository      | GitHub                           | Git-native workflow and GitHub Pages deployment |

---

# Frontend

## Framework

**React**

Reason:

- Mature ecosystem
- Huge community
- Excellent AI tooling support
- Large component ecosystem
- Easy maintenance
- Ideal for a rich editor

---

## Build Tool

**Vite**

Reason:

- Extremely fast development
- Fast production builds
- Excellent React integration
- Modern tooling

---

## Routing

**React Router**

Reason:

- Stable
- Mature
- Lightweight
- Easy to maintain

---

# UI

## Component Library

**shadcn/ui**

Reason:

- Open source
- Accessible
- Customizable
- No vendor lock-in
- Built with Radix UI primitives
- Excellent developer experience

---

## Styling

**Tailwind CSS**

Reason:

- Fast development
- Consistent design
- Easy customization
- Excellent ecosystem

---

## Icons

**Lucide React**

Reason:

- Open source
- Consistent
- Lightweight
- Tree-shakeable

---

## Animations

**Motion (Framer Motion successor)**

Reason:

- Smooth UI interactions
- Modern API
- Production ready
- Great React support

Animations should enhance the experience without affecting performance.

---

# Rich Text Editor

## Choice

**TipTap**

Reason:

- Best developer experience
- Built on ProseMirror
- Markdown serialization
- Highly extensible
- Large ecosystem
- Excellent documentation

Required extensions:

- Tables
- Images
- Code blocks
- Mathematics
- Mermaid
- Callouts
- Slash commands
- Task lists
- YouTube embeds
- Links
- Typography

---

# Markdown

Storage format:

Markdown with frontmatter.

Reason:

- Portable
- Human-readable
- Git-friendly
- Future-proof
- Static-site compatible

Markdown is an implementation detail.

Users interact with a rich editor.

---

# Image Processing

Libraries:

- sharp
- imagemin

Responsibilities:

- Compression
- WebP generation
- AVIF (future)
- Responsive sizes
- Cover images
- Metadata extraction

---

# Syntax Highlighting

**Shiki**

Reason:

- Beautiful syntax highlighting
- VS Code grammars
- High-quality output
- Static generation support

---

# Mathematics

**KaTeX**

Reason:

- Fast rendering
- Static compatible
- Excellent documentation

---

# Diagrams

**Mermaid**

Reason:

- Popular
- Markdown friendly
- Technical blogging standard

---

# Search

**Pagefind**

Reason:

- Static search
- No backend
- Fast
- Zero infrastructure
- Perfect for GitHub Pages

Alternatives considered:

- Algolia → Requires external service
- Meilisearch → Requires a server
- Lunr → Larger client bundle

Decision:

Pagefind aligns best with Ilm's "no backend" philosophy.

---

# AI

Architecture:

Bring Your Own Key (BYOK)

Supported providers (initially):

- OpenAI
- Anthropic
- Google Gemini

Future:

- Local models
- Ollama
- OpenRouter

Reason:

- No recurring costs
- User control
- Flexible provider choice

---

# Authentication

Preferred:

GitHub Authentication

Purpose:

- Repository access
- Publishing
- Reading content

GitHub is the only supported provider in Version 1.

---

# Repository Layout

Content is stored directly in a user-owned GitHub repository.

The Ilm repository contains the CMS, infrastructure, packages, and templates only.

The user's blog repository is external and independent.

Example:

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
```

No database.

Git is the database.

---

# Static Site Template

**Astro**

Reason:

- Excellent SEO
- Minimal JavaScript
- Markdown-first
- Fast builds
- Great content collections
- RSS and sitemap support
- Ideal for technical blogs

Alternatives considered:

- Next.js → More complexity than required
- Hugo → Less flexibility for the CMS ecosystem
- Eleventy → Smaller ecosystem

Decision:

Astro is the first official static-site template for user-owned blog repositories.

It must adapt to the framework-agnostic repository structure instead of forcing content into Astro-specific directories.

The Ilm CMS repository must not contain a live blog app.

---

# Deployment

Primary:

GitHub Pages

Supported in the future:

- Cloudflare Pages
- Netlify
- Vercel

The CMS should not depend on a specific hosting provider beyond GitHub Pages for the initial experience.

---

# CI/CD

**GitHub Actions**

Responsibilities:

- Build website
- Optimize media
- Generate sitemap
- Generate RSS
- Generate search index
- Deploy to GitHub Pages

The CMS should focus on content creation; the build pipeline should handle site generation.

---

# Analytics

Supported integrations:

- Google Analytics
- Google Search Console

Analytics remain owned by the user.

Ilm acts as an integration layer, not a data owner.

---

# SEO

Automatically managed:

- Meta tags
- Open Graph
- Twitter Cards
- Canonical URLs
- JSON-LD
- RSS
- Sitemap
- robots.txt
- Reading time
- Slugs

The user can customize values before publishing.

---

# Testing

| Type       | Technology            |
| ---------- | --------------------- |
| Unit       | Vitest                |
| Component  | React Testing Library |
| End-to-End | Playwright            |

---

# Code Quality

- ESLint
- Prettier
- Husky
- lint-staged
- TypeScript strict mode

Every commit should pass formatting and linting checks.

---

# Recommended Folder Structure

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
```

This keeps the CMS, infrastructure, templates, and shared packages modular while keeping the user's blog repository independent from Ilm internals.

---

# Design Principles

Every technology should satisfy at least one of these goals:

- Improves the writing experience
- Improves maintainability
- Improves performance
- Improves SEO
- Preserves user ownership
- Eliminates unnecessary infrastructure
- Avoids vendor lock-in

If a technology does not meaningfully contribute to these goals, it should not be included.

---

# Final Technology Summary

| Category          | Choice                                      |
| ----------------- | ------------------------------------------- |
| Language          | TypeScript                                  |
| Frontend          | React                                       |
| Build Tool        | Vite                                        |
| Styling           | Tailwind CSS                                |
| UI                | shadcn/ui                                   |
| Icons             | Lucide React                                |
| Animation         | Motion                                      |
| Editor            | TipTap                                      |
| Markdown          | Markdown + Frontmatter                      |
| Image Processing  | sharp + imagemin                            |
| Code Highlighting | Shiki                                       |
| Math              | KaTeX                                       |
| Diagrams          | Mermaid                                     |
| Search            | Pagefind                                    |
| AI                | BYOK (OpenAI, Anthropic, Gemini)            |
| Publishing        | Dedicated workflow package                  |
| Static Site       | Astro template                              |
| Hosting           | GitHub Pages                                |
| CI/CD             | GitHub Actions                              |
| Analytics         | Google Analytics + Google Search Console    |
| Testing           | Vitest + React Testing Library + Playwright |
| Package Manager   | pnpm                                        |
| Monorepo          | Turborepo                                   |
| Version Control   | Git + GitHub                                |

The chosen stack emphasizes long-term maintainability, modern developer experience, excellent technical SEO, and complete ownership while avoiding unnecessary infrastructure and recurring costs.
