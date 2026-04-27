# Astro Vault Template

A self-hosted, $0 alternative to **Obsidian Publish** — publish any Obsidian vault as a fast static site that closely mimics the Obsidian Publish UI: collapsible folder tree, wiki-style links with hover previews, scroll-spy table of contents, local force-directed graph, ⌘K full-text search, dark/light theme, and mobile slide-outs.

The vault lives as plain markdown in `content/`. A custom Astro publishing layer in `src/` reads it at build time and emits a static site that runs anywhere — Cloudflare Pages, Netlify, GitHub Pages, S3, your own box. No server, no database, no recurring fees.

> **Total infrastructure cost on Cloudflare Pages + Cloudflare Access:** $0.

---

## Quick start

```bash
# Use this repo as a GitHub template (or):
npm create astro@latest -- --template <your-org>/astro-vault-template

cd astro-vault-template
npm install
npm run dev      # preview at http://localhost:4321/
npm run build    # static build into dist/, plus Pagefind search index
```

Replace `content/` with your own Obsidian vault (or set `OBSIDIAN_VAULT_DIR` to point at one outside the repo) and the renderer picks it up automatically.

---

## Customizing

The single customization surface is [`src/config/site.ts`](src/config/site.ts). Edit it to:

- **Add meta-bar fields** — show frontmatter values like `author`, `status`, or `read time` in the page header.
- **Color the graph** — map `type` frontmatter values (or top-level folder names) to specific node colors.
- **Configure folder-collapse filenames** — defaults to `index.md` and `welcome.md`.

Defaults work out-of-the-box; you only edit the config if you want richer behavior.

---

## What's supported

- **CommonMark + GFM** — tables, footnotes, strikethrough, task lists.
- **Obsidian wikilinks** — `[[Note]]`, `[[Note|alias]]`, `[[Note#heading]]`, `![[image.png]]`, `![[document.pdf]]`.
- **Embedded images and PDFs** — copied to `public/_evidence/` at build, served alongside the site.
- **Tags** — frontmatter `tags:` plus inline `#hashtags`, indexed at `/tags/<tag>`.
- **Callouts** — `> [!note]`, `> [!tip]`, `> [!warning]`, etc.
- **Backlinks** — automatic, rendered at the bottom of every note.
- **Dataview subset** — `TABLE [WITHOUT ID] … WHERE … SORT …`, with `contains()`, `link()`, identifier paths (`type`, `this.slug`, `file.path`), and the boolean ops.
- **`draft: true` / `publish: false`** — exclude a note from the published site.
- **Frontmatter `aliases`** — alternate names a wikilink can resolve to.
- **Mobile-first** — sticky topbar with directory + contents slide-outs at narrow widths, with a unified backdrop tap-to-close.

---

## Documentation

| Topic | What's in it |
|---|---|
| [Architecture](docs/architecture.md) | The build pipeline (loader passes, remark plugins, dataview), why this exists vs. Obsidian Publish |
| [Authoring](docs/authoring.md) | Frontmatter schema, file naming, wikilinks, embeds, Dataview subset, draft/publish |
| [Deployment](docs/deployment.md) | Cloudflare Pages settings, Cloudflare Access (email OTP), custom domain, env vars |

---

## Repository layout

```
/
├── content/         Your vault — drop in any Obsidian vault here
├── src/
│   ├── config/      site.ts — the customization surface
│   ├── layouts/     Page shells (Layout.astro, NoteLayout.astro)
│   ├── components/  LeftNav, RightRail, GraphView, SearchPalette, etc.
│   ├── lib/         Vault loader, wikilink resolver, dataview engine
│   ├── pages/       Astro routes
│   ├── styles/      CSS tokens + per-component stylesheets
│   └── content.config.ts
├── _templates/      Obsidian-side templates for new notes (not published)
├── public/          Static assets + build-time generated JSON
├── docs/            This documentation
├── astro.config.ts  Site config (canonical URL, integrations)
└── package.json
```

The `content/` folder is the entire authoring surface. Open it as an Obsidian vault, edit normally, run `npm run build`, deploy.

---

## License

[MIT](LICENSE).

This template is an independent project; **Obsidian** and **Obsidian Publish** are trademarks of Dynalist Inc., used here only for descriptive comparison.
