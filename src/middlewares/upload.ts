import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';
const storage = new CloudinaryStorage({ cloudinary, params: { folder: 'changex' } });
export const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });
