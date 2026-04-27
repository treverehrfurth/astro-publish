---
title: Example project
date: 2025-01-15
type: project
tags:
  - example
---

Demonstrates a non-`note` page in another folder. Because it has `type: project` in its frontmatter, it shows up in the [[projects/index|Projects]] landing page's Dataview query and (if you configure colors in `src/config/site.ts`) gets a custom-colored node in the graph.

## Cross-folder linking

Wikilinks resolve across the entire vault, not just within the current folder. So [[notes/wikilinks]] works from here just as well as from the root.

## Backlinks

Scroll to the bottom of the page — the Backlinks section lists every other note that links here. The same data also drives the right-rail graph view.
