// ============================================
// FILE: src/services/StorageService.ts (unchanged)
// ============================================
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Readable } from 'stream';

export class StorageService {
  private static instance: StorageService;
  private s3Client: S3Client;
  private useCloudinary: boolean;

  private constructor() {
    this.s3Client = new S3Client({ region: config.aws.region, credentials: { accessKeyId: config.aws.accessKeyId, secretAccessKey: config.aws.secretAccessKey } });
    cloudinary.config({ cloud_name: config.cloudinary.cloudName, api_key: config.cloudinary.apiKey, api_secret: config.cloudinary.apiSecret });
    this.useCloudinary = !!config.cloudinary.cloudName;
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) StorageService.instance = new StorageService();
    return StorageService.instance;
  }

  async uploadImage(file: Buffer | Express.Multer.File, path: string, options?: { width?: number; height?: number; quality?: number }): Promise<string> {
    try {
      let imageBuffer = file instanceof Buffer ? file : file.buffer;
      if (options?.width || options?.height) {
        imageBuffer = await sharp(imageBuffer).resize(options.width || null, options.height || null, { fit: 'cover', withoutEnlargement: true }).jpeg({ quality: options?.quality || 80 }).toBuffer();
      }
      if (this.useCloudinary) return await this.uploadToCloudinary(imageBuffer, path);
      else return await this.uploadToS3(imageBuffer, path);
    } catch (error) {
      logger.error('Image upload failed:', error);
      throw error;
    }
  }

  private async uploadToCloudinary(buffer: Buffer, path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream({ folder: path, resource_type: 'auto', transformation: [{ quality: 'auto', fetch_format: 'auto' }] }, (error, result) => {
        if (error) reject(error);
        else resolve(result!.secure_url);
      });
      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  }

  private async uploadToS3(buffer: Buffer, path: string): Promise<string> {
    const key = `${path}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
    await this.s3Client.send(new PutObjectCommand({ Bucket: config.aws.bucket, Key: key, Body: buffer, ContentType: 'image/jpeg', ACL: 'public-read' }));
    return `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
  }

  async uploadVideo(file: Buffer, path: string): Promise<string> {
    try {
      if (this.useCloudinary) {
        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream({ folder: path, resource_type: 'video', eager: [{ width: 300, height: 300, crop: "pad", audio_codec: "none" }, { width: 160, height: 120, crop: "crop", audio_codec: "none" }], eager_async: true }, (error, result) => {
            if (error) reject(error);
            else resolve(result!.secure_url);
          });
          const readableStream = new Readable();
          readableStream.push(file);
          readableStream.push(null);
          readableStream.pipe(uploadStream);
        });
      } else {
        const key = `${path}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
        await this.s3Client.send(new PutObjectCommand({ Bucket: config.aws.bucket, Key: key, Body: file, ContentType: 'video/mp4', ACL: 'public-read' }));
        return `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
      }
    } catch (error) {
      logger.error('Video upload failed:', error);
      throw error;
    }
  }

  async deleteFile(url: string): Promise<void> {
    try {
      if (url.includes('cloudinary')) {
        const publicId = url.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      } else if (url.includes('s3')) {
        const key = url.split('.com/')[1];
        await this.s3Client.send(new DeleteObjectCommand({ Bucket: config.aws.bucket, Key: key }));
      }
    } catch (error) {
      logger.error('File deletion failed:', error);
      throw error;
    }
  }

  async optimizeImage(path: string, options: { width: number; height: number; quality: number }): Promise<Buffer> {
    // Placeholder – would fetch from storage, optimize, return buffer
    return Buffer.from('');
  }

  async generateSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // For real signed URL, use getSignedUrl from @aws-sdk/s3-request-presigner
    return `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
  }
}
