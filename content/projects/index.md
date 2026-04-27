---
title: Projects
---

Folder landing pages are just `index.md` files inside a folder. The loader sees `content/projects/index.md` and maps it to the URL `/projects` (not `/projects/index`).

This is what makes folder summaries in the left nav clickable: when a folder has an `index.md`, the folder name itself becomes a link to its landing page; otherwise the folder summary is a non-link label.

## Projects in this vault

```dataview
TABLE date AS "Date"
WHERE type = "project"
SORT date DESC
```

> [!tip] Add your own
> Drop any `*.md` file into `content/projects/` with `type: project` in the frontmatter and it'll show up in the table above automatically.
