import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeStringify from 'rehype-stringify';
import { createHighlighter } from 'shiki';
import { visit } from 'unist-util-visit';

import type { Loader } from 'astro/loaders';
import type { Root } from 'mdast';
import type { Root as HastRoot, Element as HastElement } from 'hast';

import { fileToSlug, evidenceSlug } from './slugify';
import { copyEvidence } from './evidence';
import { extractToc } from './toc';
import {
  buildOutgoingLink,
  parseEvidenceRef,
  classifyExtension,
  isImageExt,
  isPrivateExt,
  isPublishableFile,
  evidencePublicUrl,
  type WikiLinkContext,
} from './wikilinks';
import {
  remarkWikilinks,
  remarkCallouts,
  remarkCaptureDataview,
  remarkCollectTags,
} from './remark-obsidian';
import { buildResolveCtx, processDataviewBlocks } from './dataview';
import { siteConfig } from '../config/site';
import type { NoteData, OutgoingLink, EvidenceRef, VaultIndexNode, GraphNode, GraphEdge } from './types';

const SKIP_DIRS = new Set(['.obsidian', '.trash', '_templates', 'node_modules', '.git', 'dist', '.astro']);
const NOTE_EXT = '.md';

interface RawNote {
  filePath: string;        // repo-relative
  vaultRel: string;        // path inside vault
  ext: string;
  title: string;
  frontmatter: Record<string, unknown>;
  body: string;
  draft: boolean;
}

async function walk(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const child = await walk(full, base);
      out.push(...child);
    } else {
      out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

/**
 * Astro 5 Content Layer loader for an Obsidian vault.
 */
export function vaultLoader(opts: {
  vaultDir: string;          // repo-relative, e.g. "content"
  publicDir: string;         // repo-relative, e.g. "public"
  repoRoot: string;          // absolute path
}): Loader {
  return {
    name: 'obsidian-vault-loader',
    load: async ({ store, logger, watcher }) => {
      const vaultRoot = path.resolve(opts.repoRoot, opts.vaultDir);
      const publicRoot = path.resolve(opts.repoRoot, opts.publicDir);

      logger.info(`Walking vault at ${vaultRoot}`);
      const allFiles = await walk(vaultRoot, opts.repoRoot);

      // ---- Pass 1: parse frontmatter, build indexes ----
      const rawNotes: RawNote[] = [];
      const assets: { vaultRel: string; ext: string }[] = [];

      const noteIndex = new Map<string, string[]>();   // lowercased filename (no ext) → repo-relative paths
      const aliasIndex = new Map<string, string>();    // lowercased alias → repo-relative path
      const assetIndex = new Map<string, string[]>();  // lowercased filename (with ext) → vault-relative paths

      for (const repoRel of allFiles) {
        const ext = path.extname(repoRel).toLowerCase();
        const vaultRel = repoRel.startsWith(opts.vaultDir + '/')
          ? repoRel.slice(opts.vaultDir.length + 1)
          : repoRel;

        if (ext === NOTE_EXT) {
          const abs = path.join(opts.repoRoot, repoRel);
          const raw = await readFile(abs, 'utf8');
          const fm = matter(raw);
          const data = (fm.data ?? {}) as Record<string, unknown>;
          const draft = data.draft === true || data.publish === false;
          if (draft) continue;

          const filenameNoExt = path.basename(repoRel, NOTE_EXT);
          const lower = filenameNoExt.toLowerCase();
          const arr = noteIndex.get(lower) ?? [];
          arr.push(repoRel);
          noteIndex.set(lower, arr);

          // Aliases (string or array)
          const aliasField = data.aliases ?? data.alias;
          if (Array.isArray(aliasField)) {
            for (const a of aliasField) {
              if (typeof a === 'string') aliasIndex.set(a.toLowerCase(), repoRel);
            }
          } else if (typeof aliasField === 'string') {
            aliasIndex.set(aliasField.toLowerCase(), repoRel);
          }

          rawNotes.push({
            filePath: repoRel,
            vaultRel,
            ext,
            title: pickTitle(data, fm.content, filenameNoExt, vaultRel),
            frontmatter: data,
            body: fm.content,
            draft,
          });
        } else if (isPublishableFile(ext) || isPrivateExt(ext)) {
          assets.push({ vaultRel, ext });
          const lowerName = path.basename(vaultRel).toLowerCase();
          const arr = assetIndex.get(lowerName) ?? [];
          arr.push(vaultRel);
          assetIndex.set(lowerName, arr);
        }
      }

      logger.info(`Found ${rawNotes.length} notes, ${assets.length} assets`);

      // ---- Pass 2: copy publishable assets to public/_evidence ----
      let copied = 0;
      for (const a of assets) {
        if (isPrivateExt(a.ext)) continue;
        await copyEvidence(vaultRoot, a.vaultRel, publicRoot);
        copied++;
      }
      logger.info(`Copied ${copied} evidence assets`);

      // ---- Pass 3: parse markdown, resolve links ----
      const ctx: WikiLinkContext = {
        fromFile: '',
        vaultDir: opts.vaultDir,
        noteIndex,
        assetIndex,
        aliasIndex,
      };

      const notes: NoteData[] = [];
      for (const n of rawNotes) {
        ctx.fromFile = n.filePath;
        const slug = fileToSlug(n.filePath, opts.vaultDir);
        const noteCtx: WikiLinkContext = { ...ctx };

        const parsed = await parseMarkdown(n.body, noteCtx);
        const outgoingLinks = parsed.data.outgoingLinks;
        const bodyTags = parsed.data.bodyTags;
        const toc = extractToc(parsed.tree);
        const html = parsed.html;

        // Frontmatter tags
        const fmTags: string[] = [];
        const t = n.frontmatter.tags;
        if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') fmTags.push(x);
        else if (typeof t === 'string') fmTags.push(t);

        const allTags = Array.from(new Set([...fmTags.map((x) => x.toLowerCase()), ...bodyTags.map((x) => x.toLowerCase())]));

        // Evidence from frontmatter
        const evidence: EvidenceRef[] = [];
        const evf = n.frontmatter.evidence_files;
        if (Array.isArray(evf)) {
          for (const e of evf) {
            if (typeof e !== 'string') continue;
            const ref = parseEvidenceRef(e, noteCtx);
            if (ref) evidence.push(ref);
          }
        }

        const folder = slug.split('/').slice(0, -1);
        const noteType = typeof n.frontmatter.type === 'string' ? (n.frontmatter.type as string) : undefined;
        const date = typeof n.frontmatter.date === 'string'
          ? n.frontmatter.date
          : n.frontmatter.date instanceof Date
            ? (n.frontmatter.date as Date).toISOString().slice(0, 10)
            : undefined;

        notes.push({
          id: n.filePath.replace(/\.md$/, ''),
          slug,
          title: n.title,
          frontmatter: serializeFrontmatter(n.frontmatter),
          body: n.body,
          html,
          toc,
          outgoingLinks,
          tags: allTags,
          evidence,
          filePath: n.filePath,
          folder,
          noteType,
          date,
          backlinks: [],
        });
      }

      // ---- Pass 4: build backlinks ----
      const slugToNote = new Map<string, NoteData>();
      for (const n of notes) slugToNote.set(n.slug, n);

      for (const note of notes) {
        for (const link of note.outgoingLinks) {
          if (!link.isNote || !link.targetSlug) continue;
          const target = slugToNote.get(link.targetSlug);
          if (!target) continue;
          if (target.slug === note.slug) continue;
          if (!target.backlinks.includes(note.slug)) target.backlinks.push(note.slug);
        }
      }

      // ---- Pass 4.5: render dataview blocks against the loaded corpus ----
      const dvCtx = buildResolveCtx(notes);
      let dvProcessed = 0;
      for (const note of notes) {
        if (!note.html.includes('data-dataview-query=')) continue;
        note.html = processDataviewBlocks(note.html, note, dvCtx);
        dvProcessed++;
      }
      if (dvProcessed > 0) logger.info(`Rendered dataview blocks in ${dvProcessed} notes`);

      // ---- Pass 5: emit graph.json + vault-index.json to public/ ----
      const graphNodes: GraphNode[] = notes.map((n) => ({
        id: n.slug,
        title: n.title,
        group: n.noteType ?? n.folder[0] ?? 'note',
      }));
      const graphEdges: GraphEdge[] = [];
      for (const note of notes) {
        for (const link of note.outgoingLinks) {
          if (!link.isNote || !link.targetSlug) continue;
          if (!slugToNote.has(link.targetSlug)) continue;
          if (link.targetSlug === note.slug) continue;
          graphEdges.push({ source: note.slug, target: link.targetSlug });
        }
      }

      const vaultIndex = buildVaultIndex(notes);

      await mkdir(publicRoot, { recursive: true });
      await writeFile(
        path.join(publicRoot, 'graph.json'),
        JSON.stringify({ nodes: graphNodes, edges: graphEdges }, null, 2),
      );
      await writeFile(
        path.join(publicRoot, 'vault-index.json'),
        JSON.stringify(vaultIndex, null, 2),
      );

      // Publishable assets (images, PDFs) — surfaced separately so the
      // left nav can list them under their parent folder. `.eml` and
      // other private extensions are excluded.
      const publishableAssets = assets
        .filter((a) => isPublishableFile(a.ext))
        .map((a) => ({
          vaultRel: a.vaultRel,
          publicUrl: evidencePublicUrl(a.vaultRel),
          filename: path.basename(a.vaultRel),
          ext: a.ext.replace(/^\./, '').toLowerCase(),
        }));
      await writeFile(
        path.join(publicRoot, 'vault-assets.json'),
        JSON.stringify(publishableAssets, null, 2),
      );

      // ---- Store entries ----
      for (const note of notes) {
        store.set({
          id: note.slug || '__root__',
          data: note,
          body: note.body,
          filePath: note.filePath,
        });
      }

      logger.info(`Loaded ${notes.length} notes, ${graphEdges.length} edges`);

      // Optional: register watcher to refresh on file changes
      if (watcher) {
        watcher.add(vaultRoot);
      }
    },
  };
}

function pickTitle(
  data: Record<string, unknown>,
  body: string,
  filename: string,
  vaultRel: string,
): string {
  // For "collapsed" folder-index files (configured in src/config/site.ts —
  // typically `index.md` / `welcome.md`), prefer frontmatter `name`,
  // then the parent folder name, then frontmatter `title`.
  const collapsedSet = new Set<string>(siteConfig.collapsedFolderFilenames);
  const isCollapsed = collapsedSet.has(filename.toLowerCase());
  if (isCollapsed) {
    if (typeof data.name === 'string' && data.name.trim()) return data.name.trim();
    const parts = vaultRel.split('/');
    const parentFolder = parts[parts.length - 2];
    if (parentFolder) return prettyName(parentFolder);
    // Root-level collapsed file (e.g. the site's index.md). Fall through
    // to frontmatter `title` so the browser tab and OG metadata are
    // sensible; the home page itself hides the H1 separately.
    if (typeof data.title === 'string' && data.title.trim()) return data.title.trim();
    return filename;
  }

  if (typeof data.title === 'string' && data.title.trim()) return data.title.trim();
  if (typeof data.name === 'string' && data.name.trim()) return data.name.trim();

  // Match Obsidian's behaviour: the file's own name IS the title. The first
  // body H1 is just a section heading, not the page title — so we don't
  // fall back to it.
  return filename;
}

function prettyName(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

let _highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;

async function getHighlighter() {
  if (_highlighter) return _highlighter;
  _highlighter = await createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: ['ts', 'tsx', 'js', 'jsx', 'json', 'bash', 'sh', 'css', 'html', 'md', 'yaml', 'python', 'go', 'sql'],
  });
  return _highlighter;
}

function rehypeShikiInline() {
  return async (tree: HastRoot) => {
    const highlighter = await getHighlighter();
    const tasks: { node: HastElement; lang: string; code: string }[] = [];
    visit(tree, 'element', (node: HastElement) => {
      if (node.tagName !== 'pre') return;
      const child = node.children.find((c): c is HastElement => (c as HastElement).type === 'element' && (c as HastElement).tagName === 'code');
      if (!child) return;
      const className = ((child.properties?.className as string[]) ?? []).find((c) => c.startsWith('language-'));
      const lang = className ? className.replace('language-', '') : 'text';
      const code = child.children.map((c) => ((c as { value?: string }).value ?? '')).join('');
      tasks.push({ node, lang, code });
    });
    for (const t of tasks) {
      let html: string;
      try {
        html = highlighter.codeToHtml(t.code, {
          lang: t.lang,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        });
      } catch {
        html = highlighter.codeToHtml(t.code, {
          lang: 'text',
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        });
      }
      // Replace the <pre><code>…</code></pre> with the highlighter's <pre>…</pre>
      // by parsing minimally — set raw HTML node.
      (t.node as HastElement & { type: string; tagName: string; children: unknown[]; properties?: Record<string, unknown> }).type = 'raw' as unknown as 'element';
      (t.node as unknown as { value: string }).value = html;
    }
  };
}

async function parseMarkdown(body: string, ctx: WikiLinkContext): Promise<{ tree: Root; html: string; data: { outgoingLinks: OutgoingLink[]; bodyTags: string[] } }> {
  // Run remark transforms first (so we can extract toc/links from MDAST), then convert to HTML.
  const remarkProcessor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkCaptureDataview)
    .use(remarkWikilinks, ctx)
    .use(remarkCollectTags)
    .use(remarkCallouts);
  const file = { path: ctx.fromFile, value: body, data: {} } as any;
  const mdast = remarkProcessor.parse(body) as Root;
  const transformed = (await remarkProcessor.run(mdast, file)) as Root;

  const htmlProcessor = unified()
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: 'append', properties: { className: ['heading-anchor'], 'aria-hidden': true, tabIndex: -1 } })
    .use(rehypeShikiInline)
    .use(rehypeStringify, { allowDangerousHtml: true });
  const hast = await htmlProcessor.run(transformed as unknown as HastRoot, file);
  const html = htmlProcessor.stringify(hast as unknown as HastRoot, file) as string;

  return {
    tree: transformed,
    html,
    data: {
      outgoingLinks: (file.data.outgoingLinks ?? []) as OutgoingLink[],
      bodyTags: (file.data.bodyTags ?? []) as string[],
    },
  };
}

function serializeFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
  // Convert Date instances to ISO strings so the data store can serialize them.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    out[k] = serializeValue(v);
  }
  return out;
}

function serializeValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = serializeValue(val);
    }
    return out;
  }
  return v;
}

function buildVaultIndex(notes: NoteData[]): VaultIndexNode {
  const root: VaultIndexNode = {
    name: '',
    slug: '',
    isFolder: true,
    title: 'Home',
    children: [],
  };

  for (const n of notes) {
    if (!n.slug) {
      // Root note — attach as a sibling under root with name "Home"
      continue;
    }
    const segments = n.slug.split('/');
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      cursor.children = cursor.children ?? [];
      let child = cursor.children.find((c) => c.isFolder && c.name === segments[i]);
      if (!child) {
        child = {
          name: segments[i],
          slug: segments.slice(0, i + 1).join('/'),
          isFolder: true,
          title: prettyFolder(segments[i]),
          children: [],
        };
        cursor.children.push(child);
      }
      cursor = child;
    }
    cursor.children = cursor.children ?? [];
    cursor.children.push({
      name: segments[segments.length - 1],
      slug: n.slug,
      isFolder: false,
      title: n.title,
      noteType: n.noteType,
      date: n.date,
    });
  }

  // Sort children: folders alphabetically, leaves by date desc if all have dates, else by title
  function sortChildren(node: VaultIndexNode) {
    if (!node.children) return;
    const folders = node.children.filter((c) => c.isFolder).sort((a, b) => a.title.localeCompare(b.title));
    const leaves = node.children.filter((c) => !c.isFolder);
    const allDated = leaves.length > 0 && leaves.every((l) => !!l.date);
    if (allDated) {
      leaves.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    } else {
      leaves.sort((a, b) => a.title.localeCompare(b.title));
    }
    node.children = [...folders, ...leaves];
    for (const f of folders) sortChildren(f);
  }
  sortChildren(root);
  return root;
}

function prettyFolder(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
