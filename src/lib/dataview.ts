/**
 * Minimal Dataview Query Language (DQL) support — enough to render the
 * TABLE queries used by this vault. Runs at build time over the loaded
 * notes; output is plain HTML spliced into the note's body in place of
 * the original ` ```dataview ` code block.
 *
 * Supported subset:
 *   TABLE [WITHOUT ID] <col> [AS "label"] [, <col> ...]
 *   FROM "..."                  (parsed and ignored — always uses the full corpus)
 *   WHERE <expr>                (AND/OR, =, function calls)
 *   SORT <field> [ASC|DESC]
 *
 *   Expressions: identifier paths (`type`, `this.slug`, `file.path`),
 *   string/number literals, function calls (`contains`, `link`),
 *   and `=` / `AND` / `OR`.
 */

import type { NoteData } from './types';

// ─── AST ─────────────────────────────────────────────────────────────

type Expr =
  | { type: 'ident'; path: string[] }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'call'; name: string; args: Expr[] }
  | { type: 'binop'; op: 'and' | 'or' | '='; left: Expr; right: Expr };

interface Column {
  expr: Expr;
  label?: string;
  // Display string used as the column header when no `AS` is given.
  source: string;
}

interface Query {
  withoutId: boolean;
  columns: Column[];
  from?: string;
  where?: Expr;
  sort?: { name: string; dir: 'asc' | 'desc' };
}

// ─── Lexer ───────────────────────────────────────────────────────────

interface Token { kind: string; value: string; }

const KEYWORDS = new Set([
  'TABLE', 'FROM', 'WHERE', 'SORT', 'AS', 'AND', 'OR', 'ASC', 'DESC',
  'WITHOUT', 'ID', 'LIST', 'TASK',
]);

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') {
      let j = i + 1;
      let value = '';
      while (j < input.length && input[j] !== '"') {
        if (input[j] === '\\' && j + 1 < input.length) {
          value += input[j + 1];
          j += 2;
        } else {
          value += input[j];
          j++;
        }
      }
      out.push({ kind: 'string', value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      out.push({ kind: 'number', value: input.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_.\-]/.test(input[j])) j++;
      const word = input.slice(i, j);
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) {
        out.push({ kind: 'kw', value: upper });
      } else {
        out.push({ kind: 'ident', value: word });
      }
      i = j;
      continue;
    }
    if (c === ',' || c === '(' || c === ')' || c === '=') {
      out.push({ kind: c, value: c });
      i++;
      continue;
    }
    // Permissive: skip unrecognized characters.
    i++;
  }
  return out;
}

// ─── Parser ──────────────────────────────────────────────────────────

function parseQuery(input: string): Query {
  const t = tokenize(input);
  let p = 0;

  const peek = () => t[p];
  const consume = (kind: string, value?: string): Token | null => {
    const tok = t[p];
    if (!tok || tok.kind !== kind || (value !== undefined && tok.value !== value)) return null;
    p++;
    return tok;
  };
  const eat = (kind: string, value?: string): Token => {
    const got = consume(kind, value);
    if (!got) throw new Error(`DQL parse: expected ${kind}${value !== undefined ? ' ' + value : ''} at token ${p}: ${JSON.stringify(t[p])}`);
    return got;
  };

  // TABLE [WITHOUT ID] cols
  eat('kw', 'TABLE');
  let withoutId = false;
  if (consume('kw', 'WITHOUT')) {
    eat('kw', 'ID');
    withoutId = true;
  }

  const columns: Column[] = [];
  do {
    const start = p;
    const expr = parseExpr();
    let label: string | undefined;
    if (consume('kw', 'AS')) {
      label = eat('string').value;
    }
    const source = t.slice(start, p).map((x) => x.kind === 'string' ? `"${x.value}"` : x.value).join(' ');
    columns.push({ expr, label, source });
  } while (consume(',', ','));

  let from: string | undefined;
  if (consume('kw', 'FROM')) {
    from = eat('string').value;
  }

  let where: Expr | undefined;
  if (consume('kw', 'WHERE')) {
    where = parseBoolExpr();
  }

  let sort: Query['sort'];
  if (consume('kw', 'SORT')) {
    const idTok = eat('ident');
    let dir: 'asc' | 'desc' = 'asc';
    if (consume('kw', 'DESC')) dir = 'desc';
    else consume('kw', 'ASC');
    sort = { name: idTok.value, dir };
  }

  return { withoutId, columns, from, where, sort };

  function parseBoolExpr(): Expr {
    let left = parseCmpExpr();
    for (;;) {
      const tok = peek();
      if (!tok) break;
      if (tok.kind === 'kw' && (tok.value === 'AND' || tok.value === 'OR')) {
        p++;
        const right = parseCmpExpr();
        left = { type: 'binop', op: tok.value.toLowerCase() as 'and' | 'or', left, right };
        continue;
      }
      break;
    }
    return left;
  }

  function parseCmpExpr(): Expr {
    const left = parseExpr();
    if (consume('=', '=')) {
      const right = parseExpr();
      return { type: 'binop', op: '=', left, right };
    }
    return left;
  }

  function parseExpr(): Expr {
    const tok = peek();
    if (!tok) throw new Error('DQL parse: unexpected end of input');
    if (tok.kind === 'string') { p++; return { type: 'string', value: tok.value }; }
    if (tok.kind === 'number') { p++; return { type: 'number', value: parseFloat(tok.value) }; }
    if (tok.kind === 'ident') {
      p++;
      const path = tok.value.split('.');
      if (consume('(', '(')) {
        const args: Expr[] = [];
        if (peek()?.kind !== ')') {
          do { args.push(parseExpr()); } while (consume(',', ','));
        }
        eat(')', ')');
        return { type: 'call', name: tok.value, args };
      }
      return { type: 'ident', path };
    }
    throw new Error(`DQL parse: unexpected token ${JSON.stringify(tok)}`);
  }
}

// ─── Executor ────────────────────────────────────────────────────────

interface Row { note: NoteData; fm: Record<string, unknown>; }
interface ResolveCtx {
  notes: NoteData[];
  /** map from frontmatter `slug` value → note (for `link()` and resolving names) */
  fmSlugMap: Map<string, NoteData>;
  /** map from URL slug → note */
  urlSlugMap: Map<string, NoteData>;
  /** map from lowercased title (filename minus .md) → note */
  titleMap: Map<string, NoteData>;
}

interface LinkValue {
  __link: true;
  /** Resolved URL slug or null if unresolved. */
  targetSlug: string | null;
  /** Display label. */
  label: string;
}

function getFileField(note: NoteData, name: string): unknown {
  switch (name) {
    case 'path': return note.filePath;
    case 'name': return note.title;
    case 'link': return { __link: true, targetSlug: note.slug, label: note.title } as LinkValue;
    default: return undefined;
  }
}

function resolveIdent(path: string[], row: Row, thisRow: Row): unknown {
  if (path.length === 1) return row.fm[path[0]];
  if (path[0] === 'this') {
    return path.slice(1).reduce<unknown>((acc, p) => (acc == null ? undefined : (acc as Record<string, unknown>)[p]), thisRow.fm);
  }
  if (path[0] === 'file') return getFileField(row.note, path[1]);
  // Nested frontmatter access (e.g. `meta.author`)
  return path.reduce<unknown>((acc, p) => (acc == null ? undefined : (acc as Record<string, unknown>)[p]), row.fm);
}

function evalExpr(expr: Expr, row: Row, thisRow: Row, ctx: ResolveCtx): unknown {
  switch (expr.type) {
    case 'string': return expr.value;
    case 'number': return expr.value;
    case 'ident': return resolveIdent(expr.path, row, thisRow);
    case 'call': {
      if (expr.name === 'contains') {
        const haystack = evalExpr(expr.args[0], row, thisRow, ctx);
        const needle = evalExpr(expr.args[1], row, thisRow, ctx);
        if (haystack == null) return false;
        if (Array.isArray(haystack)) return haystack.some((x) => looseEq(x, needle));
        if (typeof haystack === 'string' && typeof needle === 'string') return haystack.includes(needle);
        return false;
      }
      if (expr.name === 'link') {
        const target = evalExpr(expr.args[0], row, thisRow, ctx);
        const labelExpr = expr.args[1] ? evalExpr(expr.args[1], row, thisRow, ctx) : undefined;
        const targetSlug = resolveLinkTarget(target, ctx);
        const label = labelExpr != null ? String(labelExpr) : (targetSlug ? (ctx.urlSlugMap.get(targetSlug)?.title ?? String(target)) : String(target));
        return { __link: true, targetSlug, label } as LinkValue;
      }
      return undefined;
    }
    case 'binop': {
      if (expr.op === 'and') return !!evalExpr(expr.left, row, thisRow, ctx) && !!evalExpr(expr.right, row, thisRow, ctx);
      if (expr.op === 'or') return !!evalExpr(expr.left, row, thisRow, ctx) || !!evalExpr(expr.right, row, thisRow, ctx);
      if (expr.op === '=') return looseEq(evalExpr(expr.left, row, thisRow, ctx), evalExpr(expr.right, row, thisRow, ctx));
      return undefined;
    }
  }
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date) a = a.toISOString().slice(0, 10);
  if (b instanceof Date) b = b.toISOString().slice(0, 10);
  return String(a) === String(b);
}

function resolveLinkTarget(target: unknown, ctx: ResolveCtx): string | null {
  if (target == null) return null;
  if (typeof target === 'object' && (target as LinkValue).__link) return (target as LinkValue).targetSlug;
  const s = String(target);
  // file.path looks like "<vault>/path/to/Foo.md"; strip extension and try to match by URL slug.
  const stripped = s.replace(/\.md$/i, '');
  // Try title match
  const byTitle = ctx.titleMap.get(stripped.split('/').pop()!.toLowerCase());
  if (byTitle) return byTitle.slug;
  // Try frontmatter slug
  const byFmSlug = ctx.fmSlugMap.get(s);
  if (byFmSlug) return byFmSlug.slug;
  return null;
}

function executeQuery(q: Query, thisNote: NoteData, ctx: ResolveCtx): Row[] {
  const thisRow: Row = { note: thisNote, fm: thisNote.frontmatter };
  let rows: Row[] = ctx.notes.map((n) => ({ note: n, fm: n.frontmatter }));
  if (q.where) rows = rows.filter((r) => !!evalExpr(q.where!, r, thisRow, ctx));
  if (q.sort) {
    const { name, dir } = q.sort;
    rows.sort((a, b) => {
      const av = a.fm[name];
      const bv = b.fm[name];
      const cmp = compareValues(av, bv);
      return dir === 'desc' ? -cmp : cmp;
    });
  }
  return rows;
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a instanceof Date) a = a.toISOString();
  if (b instanceof Date) b = b.toISOString();
  return String(a).localeCompare(String(b));
}

// ─── Renderer ────────────────────────────────────────────────────────

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function renderLink(link: LinkValue): string {
  if (!link.targetSlug) return escapeHtml(link.label);
  return `<a class="wiki wiki-resolved" href="/${link.targetSlug}" data-resolved="true" data-preview-slug="${escapeHtml(link.targetSlug)}">${escapeHtml(link.label)}</a>`;
}

// Match a midnight-UTC ISO timestamp (`2026-04-20T00:00:00.000Z`) — the
// shape YAML date values take after a `Date` round-trip — so we can render
// it as just the date portion.
const ISO_MIDNIGHT_RE = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/;

function renderCellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const m = value.match(ISO_MIDNIGHT_RE);
    return escapeHtml(m ? m[1] : value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(renderCellValue).join(', ');
  if (typeof value === 'object' && (value as LinkValue).__link) return renderLink(value as LinkValue);
  return escapeHtml(String(value));
}

function columnHeader(c: Column): string {
  if (c.label) return c.label;
  // Pretty-print a single-identifier column as Title-Case with spaces.
  if (c.expr.type === 'ident' && c.expr.path.length === 1) {
    const p = c.expr.path[0];
    return p.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  }
  return c.source;
}

export function renderQuery(query: string, thisNote: NoteData, ctx: ResolveCtx): string {
  let q: Query;
  try {
    q = parseQuery(query);
  } catch (e) {
    return `<div class="dataview-error"><strong>Dataview parse error:</strong> ${escapeHtml((e as Error).message)}<pre>${escapeHtml(query)}</pre></div>`;
  }

  const rows = executeQuery(q, thisNote, ctx);

  // Header columns: implicit "File" first unless WITHOUT ID
  const headers: string[] = [];
  if (!q.withoutId) headers.push('File');
  for (const c of q.columns) headers.push(columnHeader(c));

  const thisRow: Row = { note: thisNote, fm: thisNote.frontmatter };

  let html = '<div class="dataview-table-wrap"><table class="dataview-table"><thead><tr>';
  for (const h of headers) html += `<th>${escapeHtml(h)}</th>`;
  html += '</tr></thead><tbody>';

  if (rows.length === 0) {
    html += `<tr><td colspan="${headers.length}" class="dataview-empty">No results.</td></tr>`;
  } else {
    for (const row of rows) {
      html += '<tr>';
      if (!q.withoutId) {
        const link: LinkValue = { __link: true, targetSlug: row.note.slug, label: row.note.title };
        html += `<td>${renderLink(link)}</td>`;
      }
      for (const c of q.columns) {
        const val = evalExpr(c.expr, row, thisRow, ctx);
        html += `<td>${renderCellValue(val)}</td>`;
      }
      html += '</tr>';
    }
  }
  html += '</tbody></table></div>';
  return html;
}

// ─── Helpers exposed to the loader ───────────────────────────────────

export function buildResolveCtx(notes: NoteData[]): ResolveCtx {
  const fmSlugMap = new Map<string, NoteData>();
  const urlSlugMap = new Map<string, NoteData>();
  const titleMap = new Map<string, NoteData>();
  for (const n of notes) {
    urlSlugMap.set(n.slug, n);
    const fmSlug = (n.frontmatter as Record<string, unknown>).slug;
    if (typeof fmSlug === 'string') fmSlugMap.set(fmSlug, n);
    titleMap.set(n.title.toLowerCase(), n);
  }
  return { notes, fmSlugMap, urlSlugMap, titleMap };
}

/**
 * Replace `<div data-dataview-query="...">` placeholders in `html` with
 * the rendered query results. Note's own frontmatter is `this`.
 */
export function processDataviewBlocks(html: string, thisNote: NoteData, ctx: ResolveCtx): string {
  // The placeholder is emitted by remarkCaptureDataview as
  //   <div data-dataview-query="...">…
  // remark-rehype may serialize the (empty) div either as a self-closing
  // `<div data-dataview-query="…" />` or with an explicit close tag, so
  // we match either form.
  return html.replace(
    /<div\s+data-dataview-query="([^"]*)"\s*(?:\/>|>\s*<\/div>)/g,
    (_full, encoded: string) => {
      const query = decodeAttribute(encoded);
      try {
        return renderQuery(query, thisNote, ctx);
      } catch (e) {
        return `<div class="dataview-error"><strong>Dataview error:</strong> ${escapeHtml((e as Error).message)}<pre>${escapeHtml(query)}</pre></div>`;
      }
    },
  );
}

function decodeAttribute(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
