// ============================================================
// FILE: src/middlewares/upload.ts (UPDATED – increased limit)
// ============================================================

import multer from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  // ✅ Increased limit to 50MB (50 * 1024 * 1024 = 52,428,800 bytes)
  // You can adjust this to 100MB if needed: 100 * 1024 * 1024
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    // Accept images, PDFs, and videos
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('video/')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, and videos are allowed'));
    }
  },
});
