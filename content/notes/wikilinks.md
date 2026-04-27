---
title: Wikilinks
date: 2025-01-15
tags:
  - guide
---

Standard Obsidian wikilink syntax is supported throughout the vault.

## Plain links

A bare wikilink renders as a styled in-site link with hover previews and bidirectional backlinks:

- `[[notes/getting-started]]` → [[notes/getting-started]]
- `[[notes/getting-started|with a custom label]]` → [[notes/getting-started|with a custom label]]
- `[[notes/getting-started#File naming|jump to a heading]]` → [[notes/getting-started#File naming|jump to a heading]]

## Resolution order

When you write `[[Foo]]`, the loader tries (in order):
1. Exact filename match (case-sensitive).
2. Lowercased filename match.
3. Frontmatter `aliases` lookup.
4. Path-style references like `[[projects/example-project]]`.
5. Asset lookup (with extension) — e.g. `[[sample.png]]`.

If nothing resolves, the link renders with an `unresolved` class so you can spot broken links visually.

## Image embeds

`![[image.png]]` embeds the asset inline. The loader copies any `.png .jpg .jpeg .gif .webp .svg .avif .bmp .tiff .ico` it finds in the vault into `public/_evidence/` and rewrites the embed to point at the served URL.

![[sample.svg]]

## File embeds (PDFs, etc.)

`![[document.pdf]]` renders as a "View" pill rather than embedding the PDF inline. PDFs are still copied to `public/_evidence/` and listed in the left nav under their parent folder.

## Private extensions

`.eml` files (email exports) are intentionally **never** published — keep them in your vault if you need them as primary sources, but a wikilink pointing at one will render as a "redacted" placeholder.
