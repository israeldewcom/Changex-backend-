// ============================================================
// FILE: src/services/cloudinary.ts (FIXED – compiles cleanly)
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
      timeout: 600000, // 10 minutes
      ...options,
    };

    // ─── Buffer upload ───────────────────────────────────────────────
    if (Buffer.isBuffer(input)) {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result);
          } else {
            reject(new Error('Upload failed: no result'));
          }
        }
      );
      const readable = new Readable();
      readable.push(input);
      readable.push(null);
      readable.pipe(uploadStream);
      return;
    }

    // ─── File path upload ───────────────────────────────────────────
    if (typeof input === 'string') {
      // Use standard upload for all files; Cloudinary handles large files via automatic chunking.
      // If you need explicit upload_large for >100MB, you can switch here, but we keep it simple.
      cloudinary.uploader.upload(
        input,
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result);
          } else {
            reject(new Error('Upload failed: no result'));
          }
        }
      );
      return;
    }

    reject(new Error('Invalid input: must be a file path or Buffer'));
  });
};

export const deleteFromCloudinary = async (publicId: string) => {
  await cloudinary.uploader.destroy(publicId);
};

export default cloudinary;
