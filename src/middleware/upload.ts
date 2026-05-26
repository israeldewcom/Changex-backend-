// File: src/middlewares/upload.ts
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'changex',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'mp4', 'mov', 'avi', 'mkv'],
    resource_type: 'auto',
    transformation: file.mimetype.startsWith('image') ? [{ width: 500, height: 500, crop: 'limit' }] : [],
  }),
});

export const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB
