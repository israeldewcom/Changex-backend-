import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
// import { v2 as cloudinary } from 'cloudinary';  // REMOVED – Cloudinary not used
import sharp from 'sharp';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Readable } from 'stream';

export class StorageService {
  private static instance: StorageService;
  private s3Client: S3Client;
  private useCloudinary: boolean;  // kept for compatibility but always false

  private constructor() {
    this.s3Client = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
    // cloudinary removed
    this.useCloudinary = false;  // force S3 only
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) StorageService.instance = new StorageService();
    return StorageService.instance;
  }

  async uploadImage(file: Buffer | Express.Multer.File, path: string, options?: { width?: number; height?: number; quality?: number }): Promise<string> {
    try {
      let imageBuffer = file instanceof Buffer ? file : file.buffer;
      if (options?.width || options?.height) {
        imageBuffer = await sharp(imageBuffer)
          .resize(options.width || null, options.height || null, { fit: 'cover', withoutEnlargement: true })
          .jpeg({ quality: options?.quality || 80 })
          .toBuffer();
      }
      // Always use S3 (Cloudinary removed)
      return await this.uploadToS3(imageBuffer, path);
    } catch (error) {
      logger.error('Image upload failed:', error);
      throw error;
    }
  }

  private async uploadToS3(buffer: Buffer, path: string): Promise<string> {
    const key = `${path}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
    await this.s3Client.send(new PutObjectCommand({
      Bucket: config.aws.bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    }));
    return `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
  }

  async uploadVideo(file: Buffer, path: string): Promise<string> {
    try {
      const key = `${path}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
      await this.s3Client.send(new PutObjectCommand({
        Bucket: config.aws.bucket,
        Key: key,
        Body: file,
        ContentType: 'video/mp4',
        ACL: 'public-read',
      }));
      return `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
    } catch (error) {
      logger.error('Video upload failed:', error);
      throw error;
    }
  }

  async deleteFile(url: string): Promise<void> {
    try {
      if (url.includes('s3')) {
        const key = url.split('.com/')[1];
        await this.s3Client.send(new DeleteObjectCommand({ Bucket: config.aws.bucket, Key: key }));
      }
    } catch (error) {
      logger.error('File deletion failed:', error);
      throw error;
    }
  }

  async optimizeImage(path: string, options: { width: number; height: number; quality: number }): Promise<Buffer> {
    // Stub – implement if needed
    logger.warn('optimizeImage not fully implemented');
    return Buffer.from('');
  }

  async generateSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // Stub – implement if needed
    return `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
  }
}
