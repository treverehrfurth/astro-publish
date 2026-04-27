# Authoring

Everything about writing notes that the Astro renderer understands.

## File naming

Use any filename you like — the loader doesn't impose a schema. Two name-based conventions are worth knowing:

- **Date-prefixed names** like `2025-01-15 - My Note.md` get sorted chronologically (newest-first) in the left nav, and the `YYYY-MM-DD - ` prefix is **stripped from the displayed nav label** (the URL slug keeps the prefix, so the link stays unique).
- **Folder-collapse files** — by default `index.md` (or `welcome.md`) inside a folder *becomes* that folder's URL. So `content/projects/index.md` lives at `/projects` (not `/projects/index`), and the folder name in the nav becomes a clickable link to the landing page. Configure the list in [`src/config/site.ts`](../src/config/site.ts).

---

## Frontmatter

Every note can carry YAML frontmatter. The fields the renderer pays attention to:

```yaml
title:           # display title; falls back to filename
date:            # YYYY-MM-DD (sortable; shown in the meta bar by default)
tags:            # list of strings — rendered as pills, indexed at /tags/<tag>
aliases:         # alternate names a [[wikilink]] can resolve to
type:            # optional grouping — keys siteConfig.graphColors for node coloring
draft: true      # OR publish: false — exclude from the published site entirely
```

Anything else is yours. To surface a custom field in the page header meta bar (e.g. `author`, `status`, `read time`), add an entry to `siteConfig.metaFields` in `src/config/site.ts`.

### Hiding a note

Add either flag to a note's frontmatter:

```yaml
draft: true
# or
publish: false
```

The loader skips it in pass 1 — no page, no nav entry, no backlinks, no graph node. The file stays in your vault for Obsidian.

---

## Wikilinks

Standard Obsidian syntax:

| Markdown | Renders as |
|---|---|
| `[[Note Name]]` | Resolved link to the matching note |
| `[[Note Name\|custom label]]` | Same link with custom display text |
| `[[Note Name#Heading]]` | Link with heading anchor |
| `[[image.png]]` | Link to the published asset |
| `![[image.png]]` | Inline `<img>` |
| `![[document.pdf]]` | Inline "View" pill (PDFs aren't embedded) |

Resolution order:
1. Exact filename (case-sensitive)
2. Lowercased filename
3. Frontmatter `aliases`
4. Path-style references (e.g. `[[projects/example-project]]`)
5. Asset lookup by full filename incl. extension

Unresolved wikilinks render with an `unresolved` class so they're visually distinguishable.

---

## Embeds

`![[file.png]]` embeds the asset inline. The loader recognizes:

| Extension | Behavior |
|---|---|
| `.png .jpg .jpeg .gif .webp .svg .avif .bmp .tiff .ico` | Copied to `public/_evidence/`, embeddable via `![[file.png]]`, listed in the left nav |
| `.pdf` | Copied to `public/_evidence/`, linked via `[[file.pdf]]` (not embedded inline), listed in the left nav |
| `.eml` | **Never published** — kept in the source repo only. Wikilinks to `.eml` render as a "redacted" placeholder. |
| `.md` | Treated as a normal note, regardless of folder. |

All non-private assets show up in the left nav under their parent folder, alongside markdown notes.

---

## Tags

Both forms work and are merged:

```yaml
---
tags:
  - guide
  - reference
---

Inline #hashtags in the body are also extracted and merged with the
frontmatter tags.
```

Each tag has its own page at `/tags/<tag>` listing every note that uses it.

---

## Callouts

Obsidian callout syntax is supported:

```markdown
> [!note] Optional title
> Body of the callout.

> [!tip]+ Collapsible (initially open)
> Use `+` for open, `-` for closed.

> [!warning]
> No title means the type-name is used.
```

Recognized types: `note`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `bug`, `example`, `quote`, `abstract`. Each gets a different accent color.

---

## Dataview (subset)

Place a `dataview` code block anywhere in a note:

````markdown
```dataview
TABLE date AS "Date"
WHERE contains(tags, "guide")
SORT date DESC
```
````

At build time the block is replaced with an HTML table whose first column links to each matching note (with the same hover preview as a wikilink). Add `WITHOUT ID` to suppress that implicit first column.

### Supported syntax

```
TABLE [WITHOUT ID] <col> [AS "label"] [, <col> ...]
FROM "..."             # parsed and ignored — always queries the full corpus
WHERE <expr>
SORT <field> [ASC|DESC]
```

Expressions:
- Identifier paths: any frontmatter key, plus `this.<key>` (the host note), `file.path`, `file.name`
- String literals: `"value"`
- Number literals
- Function calls: `contains(haystack, needle)`, `link(target, label)`
- Boolean ops: `AND`, `OR`, `=`

Anything outside this subset (`LIST`, `TASK`, `flatten`, `GROUP BY`, JS expressions) renders an inline error box rather than failing the build. `dataviewjs` blocks are dropped (no JS evaluation at build time).

### Examples

```dataview
# All notes tagged "guide"
TABLE date AS "Date"
WHERE contains(tags, "guide")
SORT date DESC
```

```dataview
# All notes with a specific frontmatter type
TABLE date AS "Date", status AS "Status"
WHERE type = "blog"
SORT date DESC
```

```dataview
# Notes that reference this page in a `references` array
TABLE date AS "Date"
WHERE contains(references, this.title)
```

---

## Templates

Pre-made starting points live in `_templates/` and are intentionally **not published** (the loader excludes underscore-prefixed top-level folders). Use them as Obsidian template inserts.

- [`_templates/note.md`](../_templates/note.md) — basic note (title, date, tags)
- [`_templates/folder-index.md`](../_templates/folder-index.md) — folder landing page

Add your own as your schema grows.
