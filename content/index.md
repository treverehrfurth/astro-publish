---
title: My Vault
---

A static site published from an Obsidian vault, built with Astro and styled to closely resemble Obsidian Publish.

## What this template gives you

- **Folder-tree left navigation** that mirrors your vault's directory structure, with collapse state persisted across sessions.
- **Wiki-style links** with hover previews and bidirectional **backlinks** under every page.
- **Scroll-spy table of contents** in the right rail, expanding and collapsing as you scroll.
- **Force-directed graph** view (local + global) of every note and the links between them.
- **⌘K / Ctrl+K palette search** powered by [Pagefind](https://pagefind.app/) — full-text, runs entirely client-side.
- **Tag pills, callouts, code highlighting, and a Dataview subset** out of the box.
- **Mobile-first slide-out panels** so the experience is just as usable on a phone.

## Getting around

- The **left panel** is the directory. Folders open and close; click a leaf to read it.
- The **right panel** ("Contents") is the table of contents for the current page.
- **⌘K** (Mac) or **Ctrl+K** (Windows/Linux) opens search across every note and heading.
- Links between pages preview on hover — try [[notes/getting-started]].

## Sample notes

- [[notes/getting-started|Getting started]] — frontmatter, conventions, customization
- [[notes/wikilinks|Wikilinks]] — every link/embed syntax this template supports
- [[notes/dataview-example|Dataview example]] — query-driven dynamic tables
- [[projects/example-project|Example project]] — a non-`note` page in another folder

## Customizing

The single customization surface is `src/config/site.ts`. Edit it to add meta-bar fields (date, author, status, etc.) and graph node colors. No other files need to change for typical use.
