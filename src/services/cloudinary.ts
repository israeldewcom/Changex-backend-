// ============================================================
// FILE: src/services/cloudinary.ts (FIXED TYPES)
// ============================================================

import cloudinary from '../config/cloudinary.js';
import fs from 'fs';
import { Readable } from 'stream';
import { UploadApiOptions, UploadApiResponse } from 'cloudinary';

/**
 * Upload a file to Cloudinary.
 * @param {string|Buffer} input - file path or buffer
 * @param {string} folder - Cloudinary folder
 * @param {object} options - additional options
 * @returns {Promise<UploadApiResponse>} Cloudinary result
 */
export const uploadToCloudinary = async (
  input: string | Buffer,
  folder: string,
  options?: Record<string, any>
): Promise<UploadApiResponse> => {
  // Determine if input is a file path (string) or buffer
  const isFilePath = typeof input === 'string' && fs.existsSync(input);
  const isBuffer = Buffer.isBuffer(input);

  if (!isFilePath && !isBuffer) {
    throw new Error('Invalid input: must be a file path or Buffer');
  }

  // Prepare upload options with correct types
  const uploadOptions: UploadApiOptions = {
    folder,
    resource_type: 'auto', // Accept any resource type
    access_mode: 'public',
    use_filename: true,
    unique_filename: true,
    timeout: 600000, // 10 minutes
    ...options,
  };

  // If it's a file path, use the file directly (could be large)
  if (isFilePath) {
    const stats = fs.statSync(input);
    const fileSizeMB = stats.size / (1024 * 1024);
    // For files > 100MB, use upload_large (which handles chunked upload)
    if (fileSizeMB > 100) {
      // upload_large expects the file path and options, returns a promise
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader.upload_large(
          input,
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
      });
      return result;
    } else {
      // Regular upload for smaller files
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader.upload(
          input,
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
      });
      return result;
    }
  }

  // If input is a buffer, use a readable stream
  if (isBuffer) {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      const readable = new Readable();
      readable.push(input);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  throw new Error('Unreachable');
};

export const deleteFromCloudinary = async (publicId: string) => {
  await cloudinary.uploader.destroy(publicId);
};

export default cloudinary;
