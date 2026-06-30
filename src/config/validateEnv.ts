import dotenv from 'dotenv';
dotenv.config();

const required = [
  'NODE_ENV',
  'PORT',
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'PAYSTACK_SECRET_KEY',
  'PAYSTACK_PUBLIC_KEY',
  'PAYSTACK_WEBHOOK_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
  'FRONTEND_URL',
  'ADMIN_EMAIL',
  'OPENROUTER_API_KEY',
];

export const validateEnv = () => {
  const missing = required.filter(key => !process.env[key] || process.env[key]?.trim() === '');
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ All required environment variables are present.');
};
