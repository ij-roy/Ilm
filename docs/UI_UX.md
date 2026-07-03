# UI_UX.md

# Ilm – User Interface & User Experience Specification

Version: 1.0

---

# Purpose

This document defines the user experience, interface philosophy, navigation, screen layouts, interaction patterns, and design principles of Ilm.

The goal is to create a writing experience that feels effortless, modern, and distraction-free while exposing powerful publishing capabilities only when needed.

---

# Design Philosophy

Ilm should feel like:

- Notion (clean writing)
- Linear (fast and polished)
- VS Code (keyboard-friendly)
- Arc Browser (minimal)
- Raycast (efficient)
- Hashnode (writer-first)

It should **not** feel like:

- WordPress
- Joomla
- Drupal
- Enterprise dashboards
- Complex CMS software

---

# Core UX Principles

## 1. Writing First

Writing is the primary activity.

Everything else is secondary.

The interface should disappear while writing.

---

## 2. Progressive Disclosure

Don't overwhelm users.

Advanced options appear only when relevant.

Example:

SEO panel stays collapsed until opened.

---

## 3. Zero Configuration

Users should not configure:

- RSS
- Sitemap
- robots.txt
- OpenGraph defaults
- Search index

Everything should work automatically.

---

## 4. Fast Interactions

Every interaction should feel immediate.

- Autosave
- Instant preview
- Smooth transitions
- Keyboard shortcuts

---

# Navigation

```text
┌───────────────────────────────┐
│ Ilm                           │
├───────────────────────────────┤
│ Dashboard                     │
│ Posts                         │
│ Drafts                        │
│ Media                         │
│ Analytics                     │
│ Search                        │
│ Settings                      │
└───────────────────────────────┘
```

Persistent left sidebar.

Collapsible.

Responsive on mobile.

---

# Screen 1 — Welcome

Purpose:

First-time setup.

Contains:

- Logo
- Introduction
- Connect GitHub button
- Documentation link

No unnecessary information.

---

# Screen 2 — GitHub Connection

Flow:

Connect GitHub

↓

Choose repository

↓

Verify structure

↓

Done

Simple wizard.

---

# Screen 3 — Dashboard

Shows:

- Continue writing
- Recent drafts
- Published posts
- Analytics overview
- Latest commits
- Quick actions

Quick actions:

- New Post
- Upload Media
- Settings

---

# Screen 4 — Posts

Table layout.

Columns:

- Title
- Status
- Updated
- Reading Time
- SEO Score
- Published Date

Actions:

- Edit
- Duplicate
- Delete
- Preview

Search at top.

Filters:

- Tags
- Categories
- Draft
- Published

---

# Screen 5 — Editor

This is the most important screen.

Layout:

```text
---------------------------------------------------

Toolbar

---------------------------------------------------

Title

Content

---------------------------------------------------

Status Bar

---------------------------------------------------
```

---

Toolbar includes:

- Headings
- Bold
- Italic
- Lists
- Quote
- Code
- Table
- Link
- Image
- Video
- Mermaid
- Math
- AI
- Publish

---

Editor Features

- Drag images
- Paste screenshots
- Slash commands
- Emoji support
- Markdown shortcuts
- Keyboard shortcuts
- Autosave
- Word count
- Reading time

---

# Right Sidebar

Tabs:

SEO

AI

Outline

Properties

Publishing

Only one visible at a time.

---

SEO Tab

Displays:

- SEO Score
- Title
- Description
- Slug
- Canonical
- OpenGraph Preview
- Twitter Preview

Suggestions:

- Improve title
- Add keywords
- Missing alt text
- Internal links

---

AI Tab

Actions:

Improve Writing

Fix Grammar

Rewrite

Summarize

Generate Tags

Generate Excerpt

Generate Social Post

Suggest Title

Suggest Meta Description

All suggestions require user approval.

---

Outline Tab

Generated automatically.

Shows:

- H1
- H2
- H3

Clickable.

---

Properties Tab

Contains:

- Tags
- Categories
- Series
- Cover Image
- Featured
- Publish Date

---

Publishing Tab

Shows:

Repository

Branch

Status

Preview

Publish

---

# Preview Screen

Displays:

Exactly how the article will appear.

Desktop

Tablet

Mobile

Responsive preview.

---

# Media Library

Grid view.

Shows:

Image

Size

Dimensions

Alt Text

Usage Count

Search.

Folders.

Drag & drop upload.

Clipboard paste.

---

# Analytics

Dashboard.

Cards:

Views

Visitors

Top Posts

Average Reading Time

CTR

Search Impressions

Top Queries

Traffic Sources

Core Web Vitals

---

# Search

Search bar.

Filters.

Tags.

Categories.

Instant results.

Keyboard navigation.

---

# Settings

Sections:

General

GitHub

AI

Analytics

SEO Defaults

Theme

Editor

Keyboard Shortcuts

About

---

# Publish Flow

User clicks Publish.

Dialog opens.

Checklist:

✔ Title

✔ Description

✔ Cover Image

✔ Alt Text

✔ SEO

Publish button.

Progress:

Uploading…

Creating Commit…

Pushing…

Building…

Deploying…

Published.

---

# Notifications

Toast notifications.

Examples:

Draft Saved

Published Successfully

Image Uploaded

SEO Improved

Error Publishing

Minimal.

Non-blocking.

---

# Keyboard Shortcuts

Essential shortcuts:

New Post

Publish

Preview

Search

Bold

Italic

Heading

Slash Commands

Command Palette

---

# Command Palette

Opens with keyboard shortcut.

Actions:

New Post

Search

Settings

Upload

Publish

AI Commands

Everything searchable.

---

# Responsive Behaviour

Desktop:

Three-column layout.

Tablet:

Two-column layout.

Mobile:

Single-column layout.

Editor remains usable on all devices.

---

# Accessibility

Requirements:

Keyboard accessible

Screen reader friendly

High contrast

Visible focus states

Semantic HTML

ARIA where necessary

---

# Motion

Use subtle animations only.

Examples:

Panel transitions

Dialogs

Dropdowns

Loading indicators

Never animate while typing.

---

# Empty States

Instead of blank screens:

Illustration

Helpful message

Primary action

Example:

"No posts yet."

Button:

Create your first article.

---

# Error States

Examples:

GitHub disconnected

AI unavailable

Publish failed

Image upload failed

Each should include:

Problem

Reason

Recovery action

---

# Theme

Support:

Light

Dark

System

No additional themes in Version 1.

---

# UX Success Criteria

A first-time user should be able to:

1. Connect GitHub.
2. Create a blog post.
3. Paste images.
4. Improve content with AI.
5. Preview the article.
6. Publish.
7. See the website updated.

Without reading documentation.

If the user has to think about Git, Markdown, SEO configuration, or deployment mechanics, the UX has failed.

---

# Final UX Principle

The interface should make writing feel creative and publishing feel effortless.

Every design decision should reduce cognitive load so that users spend their time thinking about ideas—not infrastructure.
