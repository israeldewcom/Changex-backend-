import multer from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB (supports heavy courses & books)
  fileFilter: (req, file, cb) => {
    // Accept images, PDFs, and videos
    if (file.mimetype.startsWith('image/') || 
        file.mimetype === 'application/pdf' || 
        file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, and videos are allowed'));
    }
  }
});
