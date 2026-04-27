import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import GithubSlugger from 'github-slugger';
import type { Root, Heading } from 'mdast';
import type { TocItem } from './types';

export function extractToc(tree: Root, maxDepth = 3): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  visit(tree, 'heading', (node: Heading) => {
    if (node.depth > maxDepth) return;
    const text = toString(node).trim();
    if (!text) return;
    const id = slugger.slug(text);
    items.push({ depth: node.depth, text, id });
  });
  return items;
}
