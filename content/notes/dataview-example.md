---
title: Dataview example
date: 2025-01-15
tags:
  - guide
  - dataview
---

The build pipeline supports a useful subset of Obsidian's [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) plugin — enough to drive automatic tables of notes off frontmatter without you maintaining the lists by hand.

## All `guide`-tagged notes

```dataview
TABLE date AS "Date"
WHERE contains(tags, "guide")
SORT date DESC
```

## All `project` notes

```dataview
TABLE date AS "Date"
WHERE type = "project"
SORT title ASC
```

## Supported syntax

```
TABLE [WITHOUT ID] <col> [AS "label"] [, <col> ...]
FROM "..."             # parsed and ignored — always queries the full corpus
WHERE <expr>
SORT <field> [ASC|DESC]
```

Expressions support:

- Identifier paths: `type`, `this.slug`, `file.path`, `file.name`
- String literals (`"foo"`), number literals
- Function calls: `contains(haystack, needle)`, `link(target, label)`
- Boolean ops: `AND`, `OR`, `=`

Anything outside this subset (`LIST`, `TASK`, `flatten`, `GROUP BY`, JS expressions, …) renders an inline error box rather than failing the build. `dataviewjs` blocks are dropped (no JS evaluation at build time).

The first column of every table is an implicit link to the matching note (with the same hover preview behavior as a wikilink). Add `WITHOUT ID` to suppress it.
