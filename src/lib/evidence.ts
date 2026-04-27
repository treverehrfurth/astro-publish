import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { evidenceSlug } from './slugify';

/**
 * Mirror an evidence file from the vault into public/_evidence/, slugifying
 * the filename so URLs are stable.
 *
 * @param vaultRoot   absolute path to the vault root (e.g. /repo/content)
 * @param vaultRel    path of the file relative to the vault root
 * @param publicRoot  absolute path to the public directory (e.g. /repo/public)
 * @returns the public-relative URL the file is served at
 */
export async function copyEvidence(
  vaultRoot: string,
  vaultRel: string,
  publicRoot: string,
): Promise<string> {
  const segments = vaultRel.split('/').map((seg, i, arr) => {
    return i === arr.length - 1 ? evidenceSlug(seg) : seg.toLowerCase().replace(/\s+/g, '-');
  });
  const publicRel = ['_evidence', ...segments].join('/');
  const dest = path.join(publicRoot, publicRel);
  const src = path.join(vaultRoot, vaultRel);

  // Idempotent copy: skip if dest exists with same mtime/size as src.
  try {
    const [s, d] = await Promise.all([stat(src), stat(dest)]);
    if (d.size === s.size && d.mtimeMs >= s.mtimeMs) {
      return '/' + publicRel;
    }
  } catch {
    // dest doesn't exist yet — fall through to copy
  }

  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
  return '/' + publicRel;
}
