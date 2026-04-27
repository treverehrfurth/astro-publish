// Shared types used by the loader and components.

export type EvidenceKind = 'image' | 'pdf' | 'eml' | 'note' | 'other';

export interface EvidenceRef {
  /** Filename as written in the vault. */
  filename: string;
  /** Public URL where the file is served. null for unpublished kinds (.eml). */
  href: string | null;
  /** Display label (filename minus extension). */
  label: string;
  kind: EvidenceKind;
}

export interface OutgoingLink {
  /** Raw target as written, e.g. "My Note" or "2025-01-15 - sample.png". */
  target: string;
  /** True if it was an Obsidian embed (![[...]]). */
  embed: boolean;
  /** Display caption from |alias divider, if any. */
  caption?: string;
  /** Resolved URL (absolute path on the site), or null if unresolved. */
  href: string | null;
  /** Whether this points at a vault note (vs an evidence file). */
  isNote: boolean;
  /** Slug of the target note if isNote && resolved. */
  targetSlug?: string;
  /** Heading anchor if the wikilink had #anchor. */
  anchor?: string;
}

export interface TocItem {
  depth: number;
  text: string;
  id: string;
}

export interface NoteData {
  /** Stable id (the relative file path without extension). */
  id: string;
  /** URL slug (no leading or trailing slash). Empty string = home. */
  slug: string;
  /** Title from frontmatter or first H1 or filename. */
  title: string;
  /** Frontmatter parsed from the file (sanitized for serialization). */
  frontmatter: Record<string, unknown>;
  /** Markdown body with frontmatter removed (raw, for search indexing). */
  body: string;
  /** Compiled HTML (the loader runs the full markdown pipeline). */
  html: string;
  /** Heading hierarchy. */
  toc: TocItem[];
  /** Outgoing wikilinks (notes + evidence). */
  outgoingLinks: OutgoingLink[];
  /** Tags from frontmatter + body #hashtags. */
  tags: string[];
  /** Evidence files referenced from frontmatter. */
  evidence: EvidenceRef[];
  /** Original repo-relative path. */
  filePath: string;
  /** Folder breadcrumb segments (slugified). */
  folder: string[];
  /** Type from frontmatter, if any: incident | report | pattern | person | org | department | team. */
  noteType?: string;
  /** Date from frontmatter, if any (ISO string). */
  date?: string;
  /** Backlinks populated in pass 2: slugs of notes that link here. */
  backlinks: string[];
}

export interface VaultIndexNode {
  /** Folder name (or filename for leaves). */
  name: string;
  /** URL slug if this is a renderable note, otherwise null. */
  slug: string | null;
  /** True if this is a folder. */
  isFolder: boolean;
  /** Display title (frontmatter title for note leaves; folder name otherwise). */
  title: string;
  /** noteType for leaves, used for filtering in nav. */
  noteType?: string;
  /** Sorting hint: ISO date if applicable. */
  date?: string;
  /** Absolute href override for non-note leaves (e.g. evidence assets). */
  url?: string;
  children?: VaultIndexNode[];
}

export interface GraphNode {
  id: string; // slug
  title: string;
  group: string; // noteType or folder root for coloring
}

export interface GraphEdge {
  source: string;
  target: string;
}
