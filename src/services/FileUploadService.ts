import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { StorageService } from './StorageService';
import { logger } from '../utils/logger';

export class FileUploadService {
  private static instance: FileUploadService;
  private storageService: StorageService;

  private constructor() {
    this.storageService = StorageService.getInstance();
  }

  static getInstance(): FileUploadService {
    if (!FileUploadService.instance) {
      FileUploadService.instance = new FileUploadService();
    }
    return FileUploadService.instance;
  }

  private multerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, '../../uploads/temp');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      cb(null, `${unique}-${file.originalname}`);
    }
  });

  upload = multer({
    storage: this.multerStorage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf'];
      if (allowedMimes.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Invalid file type') as any, false);
    }
  });

  async uploadCourseMedia(file: Express.Multer.File, courseId: string, type: 'thumbnail' | 'video' | 'resource'): Promise<string> {
    try {
      const fileBuffer = fs.readFileSync(file.path);
      let folder = `courses/${courseId}`;
      if (type === 'thumbnail') folder += '/thumbnails';
      else if (type === 'video') folder += '/videos';
      else folder += '/resources';
      const url = await this.storageService.uploadImage(fileBuffer, folder);
      fs.unlinkSync(file.path);
      return url;
    } catch (error) {
      logger.error('Course media upload failed:', error);
      throw error;
    }
  }
}
