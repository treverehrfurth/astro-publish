# Architecture

## Why this exists

[Obsidian Publish](https://obsidian.md/publish) is the official paid hosting service for Obsidian vaults — \$10/month per vault, locked into Obsidian's infrastructure, and limited to whatever themes their renderer supports.

This repo is a near-drop-in replacement built on commodity static-site tooling:

- **Vault format**: identical to a normal Obsidian vault — open `content/` in Obsidian and edit. No re-authoring required.
- **Renderer**: a custom Astro 5 build pipeline in `src/`, modeled on the Obsidian Publish UI (collapsible folder tree with guide lines, wikilink hover previews, scroll-spy contents panel, local force-directed graph, tag pills, backlinks, ⌘K palette search).
- **Hosting**: Cloudflare Pages free tier (unlimited bandwidth, automatic deploys from GitHub).
- **Access control**: Cloudflare Access free tier (email OTP allowlist).
- **Cost**: $0/month after a domain.

Custom-building it also lets us extend the renderer with anything Obsidian Publish doesn't support — a working subset of the Dataview plugin, evidence-asset listing in the nav, custom mobile slide-outs, etc.

---

## High-level flow

```
content/  (Obsidian vault)
   │
   │  npm run build
   ▼
src/lib/vault-loader.ts   (custom Astro Loader — runs at build time)
   │
   ├── Pass 1: index notes + assets, build noteIndex/assetIndex/aliasIndex
   ├── Pass 2: copy publishable assets (images, PDFs) to public/_evidence/
   ├── Pass 3: parse markdown (remark + rehype) for every note —
   │           resolve wikilinks, callouts, dataview placeholders, ToC, slugs
   ├── Pass 4: build backlinks across the corpus
   ├── Pass 4.5: render captured Dataview blocks against loaded notes
   └── Pass 5: emit graph.json, vault-index.json, vault-assets.json to public/
   │
   ▼
Astro static build (`dist/`)
   │
   ├── Static HTML for every note
   ├── public/_evidence/...   (images, PDFs)
   ├── public/graph.json      (force-directed graph data)
   ├── public/vault-assets.json (asset list, consumed by left nav)
   └── pagefind/              (full-text search index)
   │
   ▼
Cloudflare Pages → Cloudflare Access (email OTP) → readers
```

---

## Build-time pipeline

The custom loader is the heart of the build. It's defined in [`src/content.config.ts`](../src/content.config.ts) and implemented in [`src/lib/vault-loader.ts`](../src/lib/vault-loader.ts).

### Pass 1 — index

Walks `content/` and builds three lookup tables:
- `noteIndex` — filename (lowercased, no extension) → list of repo paths
- `assetIndex` — filename with extension → list of paths inside the vault
- `aliasIndex` — frontmatter `aliases` (lowercased) → repo path

These power wikilink resolution. Files with `draft: true` or `publish: false` in frontmatter are skipped here.

### Pass 2 — asset copy

Publishable extensions (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.avif`, `.bmp`, `.tiff`, `.ico`, `.pdf`) are copied to `public/_evidence/<vault-relative path>`. Private extensions (`.eml`) are intentionally never published.

### Pass 3 — markdown parse

Every note runs through this `remark` → `rehype` pipeline:

| Plugin | Job |
|---|---|
| `remark-parse` + `remark-gfm` | CommonMark + GitHub-flavored extensions |
| `remark-frontmatter` | Pull YAML frontmatter |
| [`remarkCaptureDataview`](../src/lib/remark-obsidian.ts) | Replace ` ```dataview ` blocks with `<div data-dataview-query>` placeholders for later rendering |
| [`remarkWikilinks`](../src/lib/remark-obsidian.ts) | Replace `[[X]]` and `![[X]]` with proper link/image MDAST nodes; collect outgoing links for backlinks |
| [`remarkCollectTags`](../src/lib/remark-obsidian.ts) | Harvest inline `#hashtags` |
| [`remarkCallouts`](../src/lib/remark-obsidian.ts) | Convert Obsidian callouts (`> [!note]`) to styled HTML |
| `remark-rehype` → `rehype-slug` → `rehype-autolink-headings` | Stable heading anchors |
| Inline Shiki | Per-block syntax highlighting (no client JS shipped) |

[`extractToc`](../src/lib/toc.ts) walks the MDAST after the remark plugins to build the table-of-contents data the right rail consumes.

### Pass 4 — backlinks

For every outgoing wikilink that resolved to a note, the target note's `backlinks` array gets the source slug pushed onto it.

### Pass 4.5 — Dataview rendering

[`src/lib/dataview.ts`](../src/lib/dataview.ts) implements a minimal subset of [Dataview Query Language](https://blacksmithgu.github.io/obsidian-dataview/queries/) — enough for the queries this vault actually uses:

- `TABLE [WITHOUT ID] col [AS "label"], …`
- `WHERE` with `=`, `AND`, `OR`, `contains()`, identifier paths (`type`, `this.slug`, `this.org`, `file.path`, `file.name`)
- `SORT field [ASC|DESC]`
- `link(file.path, name)`

Each placeholder is parsed, executed against the loaded notes (with the host note as `this`), and replaced with a rendered `<table>` whose rows link back to the matching notes (with the same hover-preview behavior as wikilinks).

### Pass 5 — emit

Three JSON files get written to `public/`:

- **`graph.json`** — `{nodes, edges}` consumed by the local-graph widget and the full graph view.
- **`vault-index.json`** — folder/leaf hierarchy for the entire vault (currently emitted but not consumed; useful for future tooling).
- **`vault-assets.json`** — list of publishable assets, consumed by the left nav so images/PDFs appear under their parent folder.

Then every note is `store.set()`-ed into the Astro content collection, and Astro renders one page per note via [`src/pages/[...slug].astro`](../src/pages/%5B...slug%5D.astro).

---

## Frontend

| Component | Role |
|---|---|
| [`src/layouts/Layout.astro`](../src/layouts/Layout.astro) | Page shell — 3-column grid (nav · main · rail) on desktop, sticky topbar with two slide-outs on tablet/phone |
| [`src/layouts/NoteLayout.astro`](../src/layouts/NoteLayout.astro) | Note page — title, meta, tags, body, evidence panel, backlinks |
| [`src/components/LeftNav.astro`](../src/components/LeftNav.astro) | Builds the folder tree from the notes collection + `vault-assets.json` |
| [`src/components/NavNode.astro`](../src/components/NavNode.astro) | Recursive tree row (folder summary or leaf link) |
| [`src/components/RightRail.astro`](../src/components/RightRail.astro) | Local graph + dynamic Contents (TOC) with scroll-spy and collapse/expand |
| [`src/components/SearchPalette.astro`](../src/components/SearchPalette.astro) | ⌘K / Ctrl+K palette over the Pagefind index |
| [`src/components/PreviewPopover.astro`](../src/components/PreviewPopover.astro) | Hover popovers for wikilinks |
| [`src/components/GraphView.astro`](../src/components/GraphView.astro) | Local + full force-directed graph (d3-force) |

The CSS is hand-rolled in [`src/styles/`](../src/styles/) — tokens, layout grid, nav guide-lines (Obsidian Publish-style), TOC collapse/expand via the `display: grid; grid-template-rows: 0fr → 1fr` trick, mobile slide-outs.

---

## Search

[Pagefind](https://pagefind.app/) runs as a post-build step (`npm run build` chains `pagefind --site dist`). It crawls the static HTML output and emits a precomputed search index that the ⌘K palette queries entirely client-side. No server, no API.

Pagefind only exists after a full build; in dev mode the palette will say "index not available" until you've run `npm run build` once.

---

## Related code paths

- Wikilink resolution and evidence semantics: [`src/lib/wikilinks.ts`](../src/lib/wikilinks.ts)
- Slug generation rules: [`src/lib/slugify.ts`](../src/lib/slugify.ts)
- Asset copying: [`src/lib/evidence.ts`](../src/lib/evidence.ts)
- Type definitions: [`src/lib/types.ts`](../src/lib/types.ts)
