// File: src/config/paystack.ts
export const paystackConfig = {
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
  publicKey: process.env.PAYSTACK_PUBLIC_KEY!,
  webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET!,
  baseUrl: 'https://api.paystack.co',
};
