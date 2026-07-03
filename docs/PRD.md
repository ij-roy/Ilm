# PRD.md

# Ilm – Product Requirements Document

---

# Executive Summary

## Product Name

**Ilm**

Meaning: **Knowledge**

## Vision

Ilm is an open-source Git-native publishing tool that provides a premium writing experience while allowing creators to completely own their content, website, SEO, and publishing pipeline.

Unlike traditional blogging platforms, Ilm never owns user content.

GitHub is the source of truth.

The generated website belongs entirely to the user.

---

# Problem Statement

Developers who want complete ownership over their blog usually use GitHub Pages.

While GitHub Pages is an excellent hosting platform, the writing experience is poor.

Today the workflow usually looks like this:

- Create markdown manually
- Organize folders
- Resize images
- Convert images
- Generate frontmatter
- Generate OpenGraph metadata
- Generate RSS
- Update sitemap
- Commit
- Push
- Wait for deployment

This process discourages writing.

Developers should spend time writing, not maintaining infrastructure.

---

# Product Vision

Writing should feel as smooth as Hashnode or Notion.

Publishing should feel like clicking one button.

Ownership should remain with the user forever.

If Ilm disappears tomorrow, the website should continue working because every piece of content already exists inside the user's GitHub repository.

---

# Core Philosophy

## Write Once. Own Forever.

Users own:

- Repository
- Content
- Images
- Domain
- SEO
- Analytics
- Brand

Ilm owns nothing.

---

# Product Goals

Ilm should become the best blogging tool for developers who own their own websites.

Primary objectives:

- Premium writing experience
- Zero-friction publishing
- Excellent technical SEO
- AI-assisted writing
- GitHub-first workflow
- Static website generation
- Full ownership
- Zero vendor lock-in
- Free to use
- Open source

---

# Target Audience

Primary:

- Software developers
- Technical bloggers
- Students
- Engineers
- Open-source maintainers

Secondary:

- Portfolio owners
- Documentation websites
- Personal knowledge websites

---

# Out of Scope

Ilm is NOT:

- WordPress
- Medium
- Hashnode
- Ghost
- Wix
- Squarespace
- Notion
- Website builder
- CMS for every use case

It is intentionally opinionated around publishing technical content.

---

# Core User Journey

1. Connect GitHub.
2. Select repository.
3. Create a new article.
4. Write using a rich editor.
5. Add images by dragging or pasting.
6. Preview the article.
7. Improve content with AI.
8. Review SEO score.
9. Click Publish.
10. Ilm commits everything to GitHub.
11. GitHub Actions builds the website.
12. GitHub Pages deploys the updated blog.

---

# Functional Requirements

## Authentication

- GitHub authentication
- Repository selection
- Secure token handling
- Logout

---

## Dashboard

Display:

- Drafts
- Published posts
- Recently updated posts
- Analytics overview
- Quick actions

---

## Rich Editor

The editor must support:

- WYSIWYG editing
- Automatic Markdown generation
- Code blocks
- Tables
- Images
- Videos
- Blockquotes
- Callouts
- Task lists
- Links
- Mermaid diagrams
- Mathematical equations
- Slash commands
- Keyboard shortcuts
- Autosave

Users should never be required to manually write Markdown.

---

## Media Management

Support:

- Drag & drop
- Clipboard paste
- Bulk upload
- Automatic optimization
- WebP conversion
- Alt text
- Captions
- Cover images
- Media library

---

## Publishing

One-click publish should:

- Validate content
- Optimize images
- Generate frontmatter
- Update metadata
- Commit to GitHub
- Trigger deployment

The user should never manually commit files.

---

## SEO

Automatically generate:

- Meta title
- Meta description
- Canonical URL
- Open Graph metadata
- Twitter Cards
- JSON-LD structured data
- Sitemap
- RSS feed
- robots.txt
- Reading time
- Slug
- Internal linking suggestions

SEO quality should be visible before publishing.

---

## AI Features

The user supplies their own AI API key (BYOK).

AI capabilities:

- Improve writing
- Fix grammar
- Rewrite paragraphs
- Generate titles
- Generate summaries
- Generate excerpts
- Suggest tags
- Suggest categories
- Improve SEO
- Suggest internal links
- Generate social media posts
- Suggest image prompts

AI assists the writer but never publishes automatically.

---

## Search

Automatically generate a static search index during the build process.

Support:

- Full-text search
- Tag filtering
- Category filtering

---

## Analytics

Integrate with user-owned services:

- Google Analytics
- Google Search Console

Provide a dashboard showing:

- Views
- Popular posts
- Traffic sources
- Search performance
- Core Web Vitals (where available)

Ilm does not own analytics data.

---

# Non-Functional Requirements

- Fast
- Accessible (WCAG compliant where practical)
- Responsive
- Offline draft support (future-friendly)
- Static output
- Secure authentication
- Clean architecture
- Modular codebase
- Extensible design

---

# Technical Constraints

- GitHub is the source of truth.
- Content stored as Markdown.
- Images stored in the repository.
- No traditional database.
- No recurring infrastructure costs required to use Ilm.
- Static-site deployment target.
- Open source.

---

# Success Criteria

A successful publishing flow should require only:

1. Write.
2. Click Publish.

Everything else should happen automatically.

---

# Risks

- GitHub API rate limits
- Repository size growth due to media
- OAuth implementation complexity
- Static-site build failures
- AI provider availability
- Git merge conflicts

The architecture should minimize these risks while preserving user ownership.

---

# Product Principles

Every feature should satisfy these questions:

- Does it reduce friction?
- Does it improve ownership?
- Does it improve writing?
- Does it improve SEO?
- Does it simplify publishing?
- Does it avoid vendor lock-in?

If the answer is "no" to most of these, the feature should be reconsidered.

---

# Guiding Principle

Ilm is not trying to become another blogging platform.

Ilm exists to make owning and publishing a technical blog as effortless as writing in a modern editor while keeping the user's content, website, and long-term discoverability entirely under their control.
