import { defineCollection, z } from 'astro:content';
import { vaultLoader } from './lib/vault-loader';
import path from 'node:path';

const repoRoot = process.cwd();
const vaultDir = process.env.OBSIDIAN_VAULT_DIR ?? 'content';

const notes = defineCollection({
  loader: vaultLoader({
    vaultDir,
    publicDir: 'public',
    repoRoot,
  }),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    frontmatter: z.record(z.unknown()),
    body: z.string(),
    html: z.string(),
    toc: z.array(z.object({ depth: z.number(), text: z.string(), id: z.string() })),
    outgoingLinks: z.array(
      z.object({
        target: z.string(),
        embed: z.boolean(),
        caption: z.string().optional(),
        href: z.string().nullable(),
        isNote: z.boolean(),
        targetSlug: z.string().optional(),
        anchor: z.string().optional(),
      }),
    ),
    tags: z.array(z.string()),
    evidence: z.array(
      z.object({
        filename: z.string(),
        href: z.string().nullable(),
        label: z.string(),
        kind: z.enum(['image', 'pdf', 'eml', 'note', 'other']),
      }),
    ),
    filePath: z.string(),
    folder: z.array(z.string()),
    noteType: z.string().optional(),
    date: z.string().optional(),
    backlinks: z.array(z.string()),
  }),
});

export const collections = { notes };
