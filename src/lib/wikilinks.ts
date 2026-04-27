import { fileToSlug, evidenceSlug, resetSlugger } from './slugify';
import type { OutgoingLink, EvidenceRef, EvidenceKind } from './types';
import path from 'node:path';

// Files we consider images (will be embedded inline when written as ![[...]]).
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp', '.tiff', '.ico',
]);

// Files we'll publish but never embed inline (linked via "View …" pill).
const FILE_EXTENSIONS = new Set(['.pdf']);

// Files we never publish.
const PRIVATE_EXTENSIONS = new Set(['.eml']);

export interface WikiLinkContext {
  /** Repo-relative path of the note containing the link. */
  fromFile: string;
  /** Vault root, relative to the repo. */
  vaultDir: string;
  /** Maps from "filename without extension, lowercased" → list of repo-relative .md paths. */
  noteIndex: Map<string, string[]>;
  /** Maps from filename (with extension, lowercased) → list of repo-relative paths inside vault. */
  assetIndex: Map<string, string[]>;
  /** Maps from frontmatter alias (lowercased) → repo-relative .md path. */
  aliasIndex: Map<string, string>;
}

export function classifyExtension(ext: string): EvidenceKind {
  const e = ext.toLowerCase();
  if (IMAGE_EXTENSIONS.has(e)) return 'image';
  if (e === '.pdf') return 'pdf';
  if (e === '.eml') return 'eml';
  return 'other';
}

export function isImageExt(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase());
}

export function isPrivateExt(ext: string): boolean {
  return PRIVATE_EXTENSIONS.has(ext.toLowerCase());
}

export function isPublishableFile(ext: string): boolean {
  const e = ext.toLowerCase();
  return IMAGE_EXTENSIONS.has(e) || FILE_EXTENSIONS.has(e);
}

/**
 * Determine the public URL for an evidence asset, given its absolute repo path.
 * The loader copies the file to public/_evidence/<vault-relative-slug-path>.
 */
export function evidencePublicUrl(vaultRelative: string): string {
  const segments = vaultRelative.split('/').map((seg, i, arr) => {
    return i === arr.length - 1 ? evidenceSlug(seg) : seg.toLowerCase().replace(/\s+/g, '-');
  });
  return '/_evidence/' + segments.join('/');
}

/**
 * Look up a wikilink target in the loader's indexes and return the resolved URL.
 *
 * Resolution priority:
 *   1. Exact filename (case-sensitive) for notes.
 *   2. Lowercased filename for notes.
 *   3. Aliases from frontmatter.
 *   4. Asset (image/pdf/etc.) by full filename incl. extension.
 *   5. Path-style references like "projects/example-project" (without .md).
 */
export function resolveWikiTarget(
  rawTarget: string,
  ctx: WikiLinkContext,
): { href: string | null; isNote: boolean; targetSlug?: string; assetPath?: string; isPrivate?: boolean } {
  const target = rawTarget.trim();
  if (!target) return { href: null, isNote: false };

  // Strip an anchor if present; the caller has already split it.
  const cleaned = target;

  // Detect extension to decide note-vs-asset. Obsidian wikilinks may
  // include the explicit `.md` suffix (e.g. `[[Foo.md]]`), so treat that
  // as a note reference too.
  const ext = path.extname(cleaned);
  const isMdRef = ext.toLowerCase() === '.md';
  const noteTarget = isMdRef ? cleaned.slice(0, -ext.length) : cleaned;
  const hasAssetExt = ext !== '' && !isMdRef;

  if (!hasAssetExt) {
    // Note lookup. Try the simple filename first.
    const lower = noteTarget.toLowerCase();
    const matches = ctx.noteIndex.get(lower);
    if (matches && matches.length > 0) {
      const filePath = matches[0];
      const slug = fileToSlug(filePath, ctx.vaultDir);
      return { href: '/' + slug, isNote: true, targetSlug: slug };
    }

    // Try alias.
    const aliasHit = ctx.aliasIndex.get(lower);
    if (aliasHit) {
      const slug = fileToSlug(aliasHit, ctx.vaultDir);
      return { href: '/' + slug, isNote: true, targetSlug: slug };
    }

    // Path-style: "projects/example-project" or "projects"
    if (noteTarget.includes('/')) {
      const candidate = ctx.vaultDir + '/' + noteTarget + '.md';
      const slug = fileToSlug(candidate, ctx.vaultDir);
      return { href: '/' + slug, isNote: true, targetSlug: slug };
    }

    return { href: null, isNote: true };
  }

  // Asset lookup (image / pdf / eml / other).
  if (isPrivateExt(ext)) {
    return { href: null, isNote: false, isPrivate: true };
  }

  const lowerName = cleaned.toLowerCase();
  const lowerBase = path.basename(lowerName);
  const matches = ctx.assetIndex.get(lowerBase);
  if (matches && matches.length > 0) {
    const vaultRelative = matches[0]; // already vault-relative
    return { href: evidencePublicUrl(vaultRelative), isNote: false, assetPath: vaultRelative };
  }

  return { href: null, isNote: false };
}

/**
 * Parse a single wikilink target string of the form "Target#anchor|caption".
 */
export function parseWikiTarget(raw: string): { target: string; anchor?: string; caption?: string } {
  const pipeIdx = raw.indexOf('|');
  let target = raw;
  let caption: string | undefined;
  if (pipeIdx >= 0) {
    target = raw.slice(0, pipeIdx);
    caption = raw.slice(pipeIdx + 1).trim();
  }
  let anchor: string | undefined;
  const hashIdx = target.indexOf('#');
  if (hashIdx >= 0) {
    anchor = target.slice(hashIdx + 1).trim();
    target = target.slice(0, hashIdx);
  }
  return { target: target.trim(), anchor, caption };
}

/**
 * Build a single OutgoingLink object from a parsed wikilink.
 */
export function buildOutgoingLink(
  raw: string,
  embed: boolean,
  ctx: WikiLinkContext,
): OutgoingLink {
  const { target, anchor, caption } = parseWikiTarget(raw);
  const resolved = resolveWikiTarget(target, ctx);
  let href = resolved.href;
  if (href && resolved.isNote && anchor) {
    href = href + '#' + anchor.toLowerCase().replace(/\s+/g, '-');
  }
  return {
    target,
    embed,
    caption,
    href,
    isNote: resolved.isNote,
    targetSlug: resolved.targetSlug,
    anchor,
  };
}

/**
 * Build an EvidenceRef from a frontmatter value like "[[2026-03-24 - file.png]]".
 */
export function parseEvidenceRef(raw: string, ctx: WikiLinkContext): EvidenceRef | null {
  // Strip surrounding [[ ]] if present
  let s = raw.trim();
  const m = s.match(/^\[\[(.+?)\]\]$/);
  if (m) s = m[1];
  const { target, caption } = parseWikiTarget(s);
  if (!target) return null;
  const ext = path.extname(target);
  const resolved = resolveWikiTarget(target, ctx);

  // If the wikilink resolves to a (or refers to a) note — either no
  // extension (`[[Foo]]`) or an explicit `.md` (`[[Foo.md]]`) — render
  // it as a note reference. Otherwise classify by extension.
  const isNoteRef = resolved.isNote;
  const kind: EvidenceKind = isNoteRef ? 'note' : ext ? classifyExtension(ext) : 'other';
  const label = caption || (ext ? target.slice(0, -ext.length) : target);

  return {
    filename: target,
    href: resolved.href,
    label,
    kind,
  };
}

export function _resetSluggerForTests() {
  resetSlugger();
}
