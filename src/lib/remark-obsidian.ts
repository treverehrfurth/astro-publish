import { visit, SKIP } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root, Text, Paragraph, Link, Image, Code, RootContent, PhrasingContent, BlockContent, Blockquote, Html, Parent } from 'mdast';
import { buildOutgoingLink } from './wikilinks';
import type { WikiLinkContext, OutgoingLink } from './wikilinks';

/**
 * Replace `[[X]]` and `![[X]]` text spans with proper mdast nodes:
 *   - `![[image.png]]`         → image node (rendered as <img>)
 *   - `![[file.pdf]]`          → link node with class "wiki evidence-embed"
 *   - `[[X]]`, `[[X|caption]]` → link node with class "wiki" (NEVER an image)
 *
 * Collected outgoing links are stashed on `file.data.outgoingLinks` for the
 * loader to pick up.
 */
export const remarkWikilinks: Plugin<[WikiLinkContext], Root> = (ctx) => {
  const WIKI_RE = /(!?)\[\[([^\]\n]+?)\]\]/g;

  return (tree, file) => {
    const links: OutgoingLink[] = [];

    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      // Don't process inside code/inlineCode — visitor already skips inlineCode by node type;
      // safety: skip if parent is link/image to avoid recursion.
      if (parent.type === 'link' || parent.type === 'linkReference' || parent.type === 'image') return;

      const value = node.value;
      if (!value.includes('[[')) return;

      const newChildren: PhrasingContent[] = [];
      let lastIndex = 0;
      WIKI_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WIKI_RE.exec(value)) !== null) {
        const [full, bang, target] = m;
        if (m.index > lastIndex) {
          newChildren.push({ type: 'text', value: value.slice(lastIndex, m.index) });
        }
        const embed = bang === '!';
        const link = buildOutgoingLink(target, embed, ctx);
        links.push(link);

        if (embed && link.href && !link.isNote) {
          // Detect image vs other publishable file via extension
          const ext = (link.target.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '').toLowerCase();
          const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'].includes(ext);
          if (isImage) {
            const imgNode: Image = {
              type: 'image',
              url: link.href,
              alt: link.caption ?? link.target,
            };
            newChildren.push(imgNode as unknown as PhrasingContent);
            lastIndex = m.index + full.length;
            continue;
          }
          // Non-image embed: render as a styled link (e.g. PDF view card).
          // Open in a new tab so the reader keeps their place in the note.
          newChildren.push({
            type: 'link',
            url: link.href,
            data: {
              hProperties: {
                className: ['wiki', 'evidence-embed'],
                'data-kind': ext.slice(1),
                target: '_blank',
                rel: 'noopener',
              },
            },
            children: [{ type: 'text', value: link.caption ?? link.target }],
          } as Link);
          lastIndex = m.index + full.length;
          continue;
        }

        // Bare wikilink (or unresolved embed): render as plain `wiki` link.
        // Note links stay same-tab; non-note (asset/evidence) links open in
        // a new tab so the reader keeps their place.
        const resolved = !!link.href;
        const display = link.caption ?? link.target;
        const linkNode: Link = {
          type: 'link',
          url: link.href ?? '#',
          title: undefined,
          children: [{ type: 'text', value: display }],
          data: {
            hProperties: {
              className: link.isNote
                ? ['wiki', resolved ? 'wiki-resolved' : 'wiki-unresolved']
                : ['wiki', 'wiki-evidence'],
              'data-resolved': String(resolved),
              ...(link.isNote && link.targetSlug ? { 'data-preview-slug': link.targetSlug } : {}),
              ...(link.isNote ? {} : { 'data-evidence': 'true', target: '_blank', rel: 'noopener' }),
            },
          },
        };
        newChildren.push(linkNode);
        lastIndex = m.index + full.length;
      }
      if (lastIndex < value.length) {
        newChildren.push({ type: 'text', value: value.slice(lastIndex) });
      }

      if (newChildren.length === 0) return;
      // Replace the text node with the new sequence.
      (parent as Parent).children.splice(index, 1, ...(newChildren as never[]));
      return [SKIP, index + newChildren.length];
    });

    file.data.outgoingLinks = links;
  };
};

const CALLOUT_RE = /^\[!(?<type>[a-zA-Z0-9_-]+)\](?<flag>[+-]?)\s*(?<title>.*)$/;

/**
 * Convert Obsidian callouts:
 *   > [!note] Title
 *   > body
 *
 * into a `<div class="callout callout-note">` HTML node.
 */
export const remarkCallouts: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
      if (!parent || index === undefined) return;
      const first = node.children[0];
      if (!first || first.type !== 'paragraph') return;
      const para = first as Paragraph;
      const firstText = para.children[0];
      if (!firstText || firstText.type !== 'text') return;
      const m = (firstText as Text).value.match(CALLOUT_RE);
      if (!m || !m.groups) return;

      const type = m.groups.type.toLowerCase();
      const collapsible = m.groups.flag === '+' || m.groups.flag === '-';
      const initiallyOpen = m.groups.flag !== '-';
      const titleRaw = m.groups.title.trim();

      // Mutate the first text node to drop the callout marker, then keep the
      // rest of the first paragraph as the title (in case there's inline
      // formatting after the marker).
      const remaining = (firstText as Text).value.replace(CALLOUT_RE, '').trim();
      const titleChildren: PhrasingContent[] = [];
      if (titleRaw || remaining) {
        titleChildren.push({ type: 'text', value: titleRaw || remaining });
      }
      // Children for body: everything except the first paragraph if we consumed it,
      // OR if the first paragraph had more than just the marker line, keep the rest.
      const body: BlockContent[] = [];
      // If the first paragraph had multi-line content (separated by softbreak / linebreak),
      // we'd have already split into siblings; with default remark behavior, the marker is
      // its own paragraph if there was a blank line after. To keep this simple, treat the
      // first paragraph as title only and the rest of the children as body.
      for (let i = 1; i < node.children.length; i++) {
        body.push(node.children[i] as BlockContent);
      }

      const labelText = titleRaw || type.charAt(0).toUpperCase() + type.slice(1);
      const open = initiallyOpen ? ' open' : '';
      const tag = collapsible ? 'details' : 'div';
      const summary = collapsible ? `<summary class="callout-title">${escapeHtml(labelText)}</summary>` : `<div class="callout-title">${escapeHtml(labelText)}</div>`;

      // Render the body children as raw HTML by stringifying via the rest of the pipeline?
      // Simpler: turn the body into a block we splice in. We'll wrap with raw HTML before/after
      // and let remark-rehype handle the children.
      const opening: Html = { type: 'html', value: `<${tag} class="callout callout-${escapeAttr(type)}"${open}>${summary}<div class="callout-body">` };
      const closing: Html = { type: 'html', value: `</div></${tag}>` };

      const replacement: RootContent[] = [opening, ...(body as RootContent[]), closing];
      (parent as Parent).children.splice(index, 1, ...(replacement as never[]));
      return [SKIP, index + replacement.length];
    });
  };
};

/**
 * Capture ` ```dataview ` code fences and replace them with placeholder
 * HTML nodes carrying the raw query as a `data-dataview-query` attribute.
 * The loader's post-processing pass executes the query against the loaded
 * notes and substitutes a rendered table.
 *
 * `dataviewjs` blocks are dropped (we don't execute arbitrary JS at build).
 */
export const remarkCaptureDataview: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (!parent || index === undefined) return;
      const lang = (node.lang ?? '').toLowerCase();
      if (lang !== 'dataview' && lang !== 'dataviewjs') return;
      if (lang === 'dataviewjs') {
        (parent as Parent).children.splice(index, 1);
        return [SKIP, index];
      }
      const encoded = node.value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const html: Html = {
        type: 'html',
        value: `<div data-dataview-query="${encoded}"></div>`,
      };
      (parent as Parent).children.splice(index, 1, html);
      return [SKIP, index + 1];
    });
  };
};

/**
 * Collect inline #hashtags from text nodes into `file.data.bodyTags`.
 * (Frontmatter tags are handled separately.)
 */
export const remarkCollectTags: Plugin<[], Root> = () => {
  const TAG_RE = /(?:^|\s)#([a-zA-Z][\w-]*)\b/g;
  return (tree, file) => {
    const tags = new Set<string>();
    visit(tree, 'text', (node: Text, _i, parent) => {
      if (!parent) return;
      if (parent.type === 'link' || parent.type === 'linkReference' || parent.type === 'image' || parent.type === 'code' || parent.type === 'inlineCode') return;
      let m: RegExpExecArray | null;
      TAG_RE.lastIndex = 0;
      while ((m = TAG_RE.exec(node.value)) !== null) {
        tags.add(m[1].toLowerCase());
      }
    });
    file.data.bodyTags = Array.from(tags);
  };
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '');
}
