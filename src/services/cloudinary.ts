import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

/**
 * Upload a buffer to Cloudinary with 2-minute timeout
 */
export const uploadToCloudinary = async (
  buffer: Buffer,
  folder: string,
  options?: Record<string, any>
): Promise<any> => {
  // Ensure Cloudinary is configured
  const hasSecret = !!(cloudinary.config() as any).api_secret;
  if (!hasSecret) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, ...options, timeout: 120000 }, // 2 minutes timeout for large files
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

export const deleteFromCloudinary = async (publicId: string) => {
  await cloudinary.uploader.destroy(publicId);
};

export default cloudinary;
