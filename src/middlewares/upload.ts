// ============================================================
// FILE: src/middlewares/upload.ts (FIXED + DEBUG LOGGING)
// ============================================================

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  fileFilter: (req, file, cb) => {
    console.log(`📎 Multer received: fieldname="${file.fieldname}", originalname="${file.originalname}", mimetype="${file.mimetype}"`);
    const isImage = file.mimetype.startsWith('image/');
    const isPDF = file.mimetype === 'application/pdf';
    if (isImage || isPDF) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ============================================================
// MEMORY-STORAGE VARIANT — for any route whose controller
// uploads straight to Cloudinary via `req.file.buffer`
// (thumbnails, lesson images, certificate templates, etc).
// The disk-storage `upload` above does NOT populate
// `req.file.buffer`, so those controllers would otherwise
// always fail with "No file uploaded" even though a file
// was sent.
// ============================================================
export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB — plenty for images/templates
  },
  fileFilter: (req, file, cb) => {
    console.log(`📎 Multer(memory) received: fieldname="${file.fieldname}", originalname="${file.originalname}", mimetype="${file.mimetype}"`);
    const isImage = file.mimetype.startsWith('image/');
    const isPDF = file.mimetype === 'application/pdf';
    if (isImage || isPDF) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});
