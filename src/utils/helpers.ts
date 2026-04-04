// ============================================
// FILE: src/utils/helpers.ts (new utility)
// ============================================
import crypto from 'crypto';

export const generateRandomCode = (length: number = 8): string => {
  return crypto.randomBytes(length).toString('hex').toUpperCase().slice(0, length);
};

export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

export const formatCurrency = (amount: number, currency: string = 'NGN'): string => {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(amount);
};

export const calculatePagination = (page: number, limit: number, total: number) => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  const maskedLocal = local.slice(0, 2) + '*'.repeat(local.length - 2);
  return `${maskedLocal}@${domain}`;
};

export const maskPhone = (phone: string): string => {
  return phone.slice(0, 4) + '*'.repeat(phone.length - 6) + phone.slice(-2);
};
