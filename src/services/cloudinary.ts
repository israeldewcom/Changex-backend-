// ============================================================
// FILE: src/services/cloudinary.ts (ALTERNATIVE – EVEN SIMPLER)
// ============================================================

import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';
import { UploadApiOptions, UploadApiResponse } from 'cloudinary';

export const uploadToCloudinary = (
  input: string | Buffer,
  folder: string,
  options?: Record<string, any>
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const uploadOptions: UploadApiOptions = {
      folder,
      resource_type: 'auto',
      access_mode: 'public',
      use_filename: true,
      unique_filename: true,
      timeout: 600000,
      ...options,
    };

    const uploadCallback = (error: any, result: UploadApiResponse | undefined) => {
      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      } else {
        reject(new Error('Upload returned no result'));
      }
    };

    if (Buffer.isBuffer(input)) {
      const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, uploadCallback);
      const readable = new Readable();
      readable.push(input);
      readable.push(null);
      readable.pipe(uploadStream);
    } else if (typeof input === 'string') {
      // Use standard upload for all files (Cloudinary handles large files automatically)
      cloudinary.uploader.upload(input, uploadOptions, uploadCallback);
    } else {
      reject(new Error('Invalid input type'));
    }
  });
};

export const deleteFromCloudinary = async (publicId: string) => {
  await cloudinary.uploader.destroy(publicId);
};

export default cloudinary;
