// ============================================================
// FILE: src/services/cloudinary.ts (accepts file path or buffer)
// ============================================================

import cloudinary from '../config/cloudinary.js';
import fs from 'fs';
import path from 'path';

/**
 * Upload a file to Cloudinary.
 * @param {string|Buffer} input - file path or buffer
 * @param {string} folder - Cloudinary folder
 * @param {object} options - additional options
 * @returns {Promise<object>} Cloudinary result
 */
export const uploadToCloudinary = async (
  input: string | Buffer,
  folder: string,
  options?: Record<string, any>
): Promise<any> => {
  return new Promise((resolve, reject) => {
    // Determine if input is a file path (string) or buffer
    const isFilePath = typeof input === 'string' && fs.existsSync(input);
    const isBuffer = Buffer.isBuffer(input);

    if (!isFilePath && !isBuffer) {
      return reject(new Error('Invalid input: must be a file path or Buffer'));
    }

    let uploadMethod = cloudinary.uploader.upload;

    // If it's a file path, check file size for upload_large
    if (isFilePath) {
      const stats = fs.statSync(input);
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > 100) {
        uploadMethod = cloudinary.uploader.upload_large;
      }
    }

    // Prepare upload options
    const uploadOptions = {
      folder,
      resource_type: 'auto',
      access_mode: 'public',
      use_filename: true,
      unique_filename: true,
      timeout: 600000, // 10 minutes
      ...options,
    };

    // If input is a buffer, use a readable stream
    if (isBuffer) {
      const uploadStream = uploadMethod(uploadOptions, (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          resolve(result);
        }
      });
      const { Readable } = require('stream');
      const readable = new Readable();
      readable.push(input);
      readable.push(null);
      readable.pipe(uploadStream);
      return;
    }

    // If input is a file path, use the file directly
    uploadMethod(input, uploadOptions, (error, result) => {
      // Clean up the temporary file after upload (optional, but we'll do it in the controller)
      if (error) {
        console.error('Cloudinary upload error:', error);
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
};

export const deleteFromCloudinary = async (publicId: string) => {
  await cloudinary.uploader.destroy(publicId);
};

export default cloudinary;
