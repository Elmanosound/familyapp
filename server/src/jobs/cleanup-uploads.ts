import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';

// ESM-safe __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Production:  /app/server/dist/jobs/cleanup-uploads.js → /app/server/uploads
// Development: src/jobs/cleanup-uploads.ts              → ../../uploads (server/uploads)
export const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively list every file under `dir`. Returns absolute paths. */
async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

/**
 * Extract the part after `/uploads/` from a DB URL string.
 * Only matches local paths, not external URLs (Cloudinary, http…).
 * Returns `null` if the URL is not a local upload.
 */
function localUploadRelativePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/uploads\/(.+)/);
  return match ? match[1] : null;
}

// ── Main job ─────────────────────────────────────────────────────────────────

/**
 * Delete every file in the `uploads/` directory that is no longer
 * referenced by any URL column in the database.
 *
 * Safe by design:
 *   - Only touches files whose path matches the `/uploads/<name>` pattern.
 *   - Cloudinary / external URLs are never considered "local" and are ignored.
 *   - A file is only deleted when it is absent from ALL URL columns checked.
 *
 * Scheduled daily at 03:00 from index.ts via node-cron.
 */
export async function cleanupOrphanUploads(): Promise<void> {
  logger.info('[cleanup] Starting orphan upload cleanup');

  try {
    // ── 1. Collect every local upload path referenced in the DB ──────────────
    const [
      users,
      families,
      messages,
      mediaItems,
      expenses,
      recipes,
    ] = await Promise.all([
      prisma.user.findMany({ select: { avatarUrl: true } }),
      prisma.family.findMany({ select: { avatarUrl: true } }),
      prisma.message.findMany({ select: { mediaUrl: true, mediaThumbnailUrl: true } }),
      prisma.media.findMany({ select: { url: true, thumbnailUrl: true } }),
      prisma.expense.findMany({ select: { receiptUrl: true } }),
      prisma.recipe.findMany({ select: { imageUrl: true } }),
    ]);

    const referenced = new Set<string>();
    const track = (url: string | null | undefined) => {
      const rel = localUploadRelativePath(url);
      if (rel) referenced.add(rel);
    };

    users.forEach((u)     => track(u.avatarUrl));
    families.forEach((f)  => track(f.avatarUrl));
    messages.forEach((m)  => { track(m.mediaUrl); track(m.mediaThumbnailUrl); });
    mediaItems.forEach((m) => { track(m.url); track(m.thumbnailUrl); });
    expenses.forEach((e)  => track(e.receiptUrl));
    recipes.forEach((r)   => track(r.imageUrl));

    logger.debug({ count: referenced.size }, '[cleanup] DB-referenced local uploads');

    // ── 2. List files on disk ─────────────────────────────────────────────────
    let diskFiles: string[];
    try {
      diskFiles = await listFilesRecursive(UPLOADS_DIR);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        logger.info('[cleanup] Uploads directory not found — nothing to clean');
        return;
      }
      throw err;
    }

    // ── 3. Delete orphans ─────────────────────────────────────────────────────
    let deleted = 0;
    let kept    = 0;
    const orphans: string[] = [];

    for (const absPath of diskFiles) {
      // Relative path from uploads root, forward-slash normalised
      const rel = path.relative(UPLOADS_DIR, absPath).replace(/\\/g, '/');

      if (referenced.has(rel)) {
        kept++;
      } else {
        orphans.push(rel);
        await fs.unlink(absPath);
        logger.info({ file: rel }, '[cleanup] Deleted orphan upload');
        deleted++;
      }
    }

    logger.info(
      { deleted, kept, total: diskFiles.length },
      '[cleanup] Orphan upload cleanup complete',
    );
  } catch (err) {
    logger.error({ err }, '[cleanup] Orphan upload cleanup failed');
  }
}
