// File: src/utils/referralCode.ts
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

export const generateReferralCode = (): string => {
  return nanoid();
};
