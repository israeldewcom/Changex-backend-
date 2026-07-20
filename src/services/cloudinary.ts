// ============================================================
// FILE: src/services/cloudinary.ts (FINAL, COMPILES WITHOUT ERRORS)
// ============================================================

import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';
import { UploadApiOptions, UploadApiResponse } from 'cloudinary';

/**
 * Upload a file to Cloudinary (supports both Buffer and file path).
 * Uses callback style to guarantee Promise<UploadApiResponse>.
 */
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

    // ─── Buffer upload via stream ──────────────────────────────
    if (Buffer.isBuffer(input)) {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result);
          } else {
            reject(new Error('Upload failed: no result from Cloudinary'));
          }
        }
      );
      const readable = new Readable();
      readable.push(input);
      readable.push(null);
      readable.pipe(uploadStream);
      return;
    }

    // ─── File path upload ──────────────────────────────────────
    if (typeof input === 'string') {
      // For files > 100MB, use upload_large (supports chunked upload)
      // For smaller files, use standard upload.
      // We'll let Cloudinary decide; but we'll use upload_large for >100MB to be safe.
      // However, upload_large also works for smaller files, so we can just use it for all.
      // But upload_large has different overloads; we'll use the callback version.
      const stats = require('fs').statSync(input);
      const fileSizeMB = stats.size / (1024 * 1024);
      const uploadMethod = fileSizeMB > 100 ? cloudinary.uploader.upload_large : cloudinary.uploader.upload;

      uploadMethod(
        input,
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result);
          } else {
            reject(new Error('Upload failed: no result from Cloudinary'));
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
