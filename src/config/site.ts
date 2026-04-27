/**
 * Site configuration — the single customization surface for this template.
 *
 * Edit the values below to adapt the renderer to your vault's frontmatter
 * schema and visual preferences. None of the rest of `src/` should need
 * editing for typical use.
 */

export interface MetaField {
  /** Display label shown in the page header meta bar. */
  label: string;
  /** Frontmatter key to read from each note. */
  key: string;
  /**
   * Optional formatter — receives the raw frontmatter value and returns
   * a display string. Return `undefined` to skip the field for a note
   * whose value doesn't apply (e.g. wrong type, empty array).
   */
  format?: (value: unknown) => string | undefined;
}

export const siteConfig = {
  /**
   * Filenames (without `.md`) that "collapse" into their parent folder —
   * e.g. `content/projects/index.md` becomes the page at `/projects`
   * (not `/projects/index`), and the page H1 falls back to the parent
   * folder name when no `title` / `name` frontmatter is set.
   *
   * Common values: `'index'`, `'welcome'`, `'readme'`.
   */
  collapsedFolderFilenames: ['index', 'welcome'] as const,

  /**
   * Page-header meta-bar fields, rendered between the H1 and the tag pills.
   * Fields are processed in order; missing/empty values are skipped.
   *
   * The default config shows only the date. Add entries to surface other
   * frontmatter fields. Examples:
   *
   *   { label: 'Author',    key: 'author' },
   *   { label: 'Status',    key: 'status', format: (v) => String(v ?? '').toUpperCase() },
   *   { label: 'Read time', key: 'readMinutes', format: (v) => typeof v === 'number' ? `${v} min` : undefined },
   */
  metaFields: [
    { label: 'Date', key: 'date' },
  ] satisfies MetaField[],

  /**
   * Graph node colors. The graph groups each note by its `type` frontmatter
   * field (or, if absent, the first folder segment of its slug), and looks
   * the group up here. Unknown groups fall back to `default`.
   *
   * Values may be any valid CSS color string OR a `var(--token)` reference
   * to one of the design tokens defined in `src/styles/tokens.css`.
   *
   * Example for a vault that uses `type: blog | project | note`:
   *
   *   graphColors: {
   *     default: 'var(--accent)',
   *     blog: '#60a5fa',
   *     project: '#34d399',
   *     note: '#fbbf24',
   *   }
   */
  graphColors: {
    default: 'var(--accent)',
  } as Record<string, string>,
};
