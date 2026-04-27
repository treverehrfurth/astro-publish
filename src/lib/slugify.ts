import GithubSlugger from 'github-slugger';

const slugger = new GithubSlugger();

function slugSegment(s: string): string {
  // Preserve YYYY-MM-DD prefixes literally; lowercase the rest, replace
  // separators, and drop characters that would break URLs. github-slugger
  // already does most of this; we run it per-segment so that path slashes
  // are preserved.
  const local = new GithubSlugger();
  return local.slug(s);
}

export function fileToSlug(relPath: string, vaultDir: string = 'content'): string {
  // relPath is the path relative to the repo root, e.g.
  // "content/projects/2025-01-15 - Example Project.md"
  let rel = relPath.replace(/\\/g, '/');
  if (rel.startsWith(vaultDir + '/')) rel = rel.slice(vaultDir.length + 1);
  rel = rel.replace(/\.md$/i, '');

  // Special-case homepage: "index" or "welcome" at the vault root.
  if (rel === 'index' || rel === 'welcome') return '';

  // Folder-index files collapse so /projects/index renders as /projects.
  // Keep this list in sync with siteConfig.collapsedFolderFilenames.
  rel = rel.replace(/\/(index|welcome)$/i, '');

  return rel
    .split('/')
    .map(slugSegment)
    .filter((s) => s.length > 0)
    .join('/');
}

export function evidenceSlug(filename: string): string {
  // Keep the extension intact; slugify the basename.
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot) : '';
  const base = dot >= 0 ? filename.slice(0, dot) : filename;
  return slugSegment(base) + ext.toLowerCase();
}

export function tagSlug(tag: string): string {
  return slugSegment(tag);
}

export function resetSlugger(): void {
  slugger.reset();
}
