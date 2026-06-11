import { v2 as cloudinary } from 'cloudinary';

console.log('🔧 Initializing Cloudinary with environment variables:');
console.log('  CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? '✓ SET' : '✗ MISSING');
console.log('  CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? '✓ SET' : '✗ MISSING');
console.log('  CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '✓ SET' : '✗ MISSING');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify configuration was applied
const configAfter = cloudinary.config();
console.log('✅ Cloudinary configuration applied.');
console.log('  api_secret present?', configAfter.api_secret ? 'YES' : 'NO');

export default cloudinary;
