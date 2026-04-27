---
title: Getting started
date: 2025-01-15
tags:
  - guide
  - setup
---

This template is designed to render any Obsidian vault. The conventions below are what the build pipeline understands; edit your notes the way you would in any vault and they'll render correctly.

## Frontmatter

Every note can carry YAML frontmatter. The fields the renderer pays attention to:

| Field | Purpose |
|---|---|
| `title` | Display title (falls back to filename) |
| `date` | ISO date — sortable, shown in the meta bar by default |
| `tags` | List of strings — rendered as pills, indexed at `/tags/<tag>` |
| `aliases` | Alternate names a `[[wikilink]]` can resolve to |
| `type` | Optional grouping — used for graph node colors |
| `draft: true` *or* `publish: false` | Skip this note entirely (no page, no nav, no graph) |

Anything else is yours to use however you like — see the [[notes/dataview-example|dataview example]] for how to drive dynamic tables off arbitrary frontmatter.

## File naming

Two conventions worth knowing:

- **Date-prefixed filenames** like `2025-01-15 - My Note.md` get sorted chronologically in the nav, and the `YYYY-MM-DD - ` prefix is **stripped from the displayed label** (the URL slug keeps it).
- **Folder-collapse files**: by default, a file named `index.md` (or `welcome.md`) inside a folder *becomes* that folder's page. So `content/projects/index.md` lives at `/projects` (not `/projects/index`). Configure the list of collapsed filenames in `src/config/site.ts`.

## Hiding a note

Add either flag to a note's frontmatter:

```yaml
draft: true
# or
publish: false
```

The loader skips it entirely. The file stays in your vault for Obsidian.

## Where to go next

- [[notes/wikilinks]] — link + embed syntax
- [[notes/dataview-example]] — dynamic tables
- [[projects/index|Projects]] — a folder-collapse page
