// ============================================
// FILE: src/config/index.ts
// ============================================
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000'),
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/changex',
    replicaUri: process.env.MONGODB_URI_REPLICA,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    premiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID!,
    elitePriceId: process.env.STRIPE_ELITE_PRICE_ID!,
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY!,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY!,
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET!,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION!,
    bucket: process.env.AWS_S3_BUCKET!,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    orgId: process.env.OPENAI_ORG_ID,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY!,
  },
  email: {
    host: process.env.SMTP_HOST!,
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
    from: process.env.EMAIL_FROM!,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  },
  features: {
    enableAIChat: process.env.ENABLE_AI_CHAT === 'true',
    enableReferralSystem: process.env.ENABLE_REFERRAL_SYSTEM === 'true',
    enableMarketplace: process.env.ENABLE_MARKETPLACE === 'true',
    enableJobBoard: process.env.ENABLE_JOB_BOARD === 'true',
  },
  webhookSecret: process.env.WEBHOOK_SECRET!,
  adminEmail: process.env.ADMIN_EMAIL!,
  twoFactorAppName: process.env.TWO_FACTOR_APP_NAME || 'ChangeXAcademy',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
};
