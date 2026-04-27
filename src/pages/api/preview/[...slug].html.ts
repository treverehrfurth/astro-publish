import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const notes = await getCollection('notes');
  return notes.map((n) => ({ params: { slug: n.data.slug || '__root__' }, props: { entry: n } }));
}

export const GET: APIRoute = ({ props }) => {
  const entry = (props as any).entry as Awaited<ReturnType<typeof getCollection<'notes'>>>[number];
  const data = entry.data;

  // Build a stripped-down HTML preview: title + first ~200 words of body.
  const text = stripMarkdown(data.body);
  const words = text.split(/\s+/).filter(Boolean);
  const truncated = words.length > 60;
  const snippet = words.slice(0, 60).join(' ') + (truncated ? '…' : '');
  const meta: string[] = [];
  if (data.date) meta.push(data.date);
  if (data.noteType) meta.push(data.noteType);

  const fragment = `
    <p class="preview-meta">${meta.map(escape).join(' · ')}</p>
    <p class="preview-title">${escape(data.title)}</p>
    <div class="preview-body"><p>${escape(snippet)}</p></div>
  `;

  // Wrap in a minimal document so Pagefind doesn't warn about missing <html>;
  // the data-pagefind-ignore attribute keeps these out of the search index.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>preview</title></head><body data-pagefind-ignore="all">${fragment}</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

function stripMarkdown(md: string): string {
  return md
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\!\[\[([^\]]+?)\]\]/g, '')
    .replace(/\[\[([^\]\|]+?)(\|([^\]]+?))?\]\]/g, (_m, t, _p, c) => c ?? t)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^>\s*\[!.+?\].*$/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
