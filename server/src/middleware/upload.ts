import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Map each accepted MIME type to a canonical file extension. The stored
// filename's extension is derived from the (filter-validated) MIME type, never
// from the client-supplied originalname — otherwise a caller could have the file
// persisted, and later served from /uploads, under an attacker-chosen extension
// such as .html (a stored-XSS vector).
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg':      '.jpg',
  'image/png':       '.png',
  'image/gif':       '.gif',
  'image/webp':      '.webp',
  'image/heic':      '.heic',
  'image/heif':      '.heif',
  'video/mp4':       '.mp4',
  'video/quicktime': '.mov',
  'video/webm':      '.webm',
  'application/pdf': '.pdf',
};

// '.bin' is only a defensive fallback: fileFilter runs first and rejects any
// MIME type not present in the map above, so it is never reached in practice.
const extFor = (mimetype: string): string => MIME_EXTENSIONS[mimetype] ?? '.bin';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${extFor(file.mimetype)}`);
  },
});

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
}).single('file');

// ── Receipt upload (images + PDF only, 10 MB max) ──────────────────────────────

const RECEIPTS_DIR = path.join(UPLOADS_DIR, 'receipts');
if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RECEIPTS_DIR),
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${extFor(file.mimetype)}`);
  },
});

const receiptFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/heic', 'image/heif', 'application/pdf',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type non autorisé : ${file.mimetype}. Formats acceptés : JPEG, PNG, GIF, WebP, PDF`));
  }
};

export const uploadReceiptSingle = multer({
  storage: receiptStorage,
  fileFilter: receiptFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
}).single('receipt');
