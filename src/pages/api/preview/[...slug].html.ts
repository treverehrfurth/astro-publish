import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const notes = await getCollection('notes');
  return notes.map((n) => ({ params: { slug: n.data.slug || '__root__' }, props: { entry: n } }));
}

export const GET: APIRoute = ({ props }) => {
  const entry = (props as any).entry as Awaited<ReturnType<typeof getCollection<'notes'>>>[number];
  const data = entry.data;

  const meta: string[] = [];
  if (data.date) meta.push(data.date);
  if (data.noteType) meta.push(data.noteType);

  // Render the actual rendered HTML (tables become <table>, lists become
  // <ul>/<ol>, callouts as boxes, etc.) instead of stripped plaintext.
  // Walk top-level block elements, take a budget's worth, drop the heavy
  // ones (dataview tables, image-only figures), and unlink anchors so the
  // popover is a static visual and doesn't trigger nested hover-previews.
  const previewBody = buildPreview(data.html);

  // The body div carries `note-body` so all article-body typography
  // (inline code, callouts, tables, lists, headings) renders identically
  // inside the popover. Popover-only deltas (compact margins, <pre>
  // truncation, hiding the heading-anchor icon) layer in popover.css.
  const fragment = `
    <p class="preview-meta">${meta.map(escape).join(' · ')}</p>
    <p class="preview-title">${escape(data.title)}</p>
    <div class="preview-body note-body">${previewBody}</div>
  `;

  // Wrap in a minimal document so Pagefind doesn't warn about missing <html>;
  // the data-pagefind-ignore attribute keeps these out of the search index.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>preview</title></head><body data-pagefind-ignore="all">${fragment}</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const KEEP_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'pre', 'blockquote', 'figure', 'div', 'dl']);

function buildPreview(html: string): string {
  if (!html) return '';

  // Tokenize once: find every open / close tag at character level. Self-
  // closing void elements are filtered out so they don't perturb depth.
  type Tok = { type: 'open' | 'close'; tag: string; attrs: string; start: number; end: number };
  const tokens: Tok[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    if (VOID_ELEMENTS.has(tag) || /\/\s*$/.test(attrs)) continue;
    tokens.push({
      type: m[1] === '/' ? 'close' : 'open',
      tag,
      attrs,
      start: m.index,
      end: tagRe.lastIndex,
    });
  }

  // Walk every top-level block (no length cap — the popover is scrollable
  // and matching the article in full was the explicit design goal).
  // shouldKeep still filters image-only figures and arbitrary <div>s.
  const blocks: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type !== 'open' || !KEEP_BLOCKS.has(t.tag)) {
      i++;
      continue;
    }
    let depth = 1;
    let j = i + 1;
    while (j < tokens.length && depth > 0) {
      if (tokens[j].tag === t.tag) {
        depth += tokens[j].type === 'open' ? 1 : -1;
      }
      j++;
    }
    if (depth !== 0) {
      i++;
      continue;
    }
    const blockHtml = html.slice(t.start, tokens[j - 1].end);
    if (shouldKeep(t.tag, t.attrs, blockHtml)) {
      blocks.push(blockHtml);
    }
    i = j;
  }
  return blocks.join('\n');
}

function shouldKeep(tag: string, attrs: string, html: string): boolean {
  // Skip figures that are just an image with no caption.
  if (tag === 'figure' && /<img\b/i.test(html) && !/<figcaption\b/i.test(html)) return false;
  // Most arbitrary <div> wrappers carry no content; only allow callouts
  // and dataview blocks (the latter render as tables/lists the reader
  // expects to see).
  if (tag === 'div' && !/class\s*=\s*["'][^"']*\b(callout|dataview)\b/i.test(attrs)) return false;
  return true;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
