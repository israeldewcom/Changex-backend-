import cloudinary from '../config/cloudinary.js'; // IMPORT THE CONFIGURED INSTANCE
import { Readable } from 'stream';

/**
 * Upload a buffer to Cloudinary
 * @param buffer - File buffer
 * @param folder - Cloudinary folder path
 * @param options - Additional upload options
 * @returns Cloudinary upload result
 */
export const uploadToCloudinary = async (
  buffer: Buffer,
  folder: string,
  options?: Record<string, any>
): Promise<any> => {
  // Debug: check if cloudinary has api_secret
  const hasSecret = !!(cloudinary.config() as any).api_secret;
  console.log(`📤 uploadToCloudinary called: has api_secret = ${hasSecret}`);

  if (!hasSecret) {
    console.error('❌ Cloudinary missing api_secret – re‑applying configuration from environment variables');
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const recheck = !!(cloudinary.config() as any).api_secret;
    console.log(`   After re‑apply: api_secret present = ${recheck}`);
    if (!recheck) {
      throw new Error('Cloudinary configuration failed: api_secret still missing after re‑apply');
    }
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, ...options },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log(`✅ File uploaded to Cloudinary: ${result?.secure_url}`);
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

/**
 * Delete a file from Cloudinary by public ID
 * @param publicId - Cloudinary public ID
 */
export const deleteFromCloudinary = async (publicId: string) => {
  await cloudinary.uploader.destroy(publicId);
};

export default cloudinary;
