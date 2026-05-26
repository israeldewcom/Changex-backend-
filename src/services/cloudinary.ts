// File: src/services/cloudinary.ts
import cloudinary from '../config/cloudinary.js';
import { UploadApiResponse } from 'cloudinary';

export const uploadToCloudinary = async (
  filePath: string,
  folder: string,
  options?: Record<string, any>
): Promise<UploadApiResponse> => {
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    ...options,
  });
  return result;
};

export const deleteFromCloudinary = async (publicId: string) => {
  await cloudinary.uploader.destroy(publicId);
};
