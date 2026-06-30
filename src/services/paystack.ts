// File: src/services/paystack.ts
import axios from 'axios';
import { paystackConfig } from '../config/paystack.js';

const paystackApi = axios.create({
  baseURL: paystackConfig.baseUrl,
  headers: {
    Authorization: `Bearer ${paystackConfig.secretKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15 seconds
});

export const initializeTransaction = async (email: string, amount: number, metadata?: any) => {
  const response = await paystackApi.post('/transaction/initialize', {
    email,
    amount: amount * 100, // Paystack expects kobo
    metadata,
  });
  return response.data;
};

export const verifyTransaction = async (reference: string) => {
  const response = await paystackApi.get(`/transaction/verify/${reference}`);
  return response.data;
};

export const createTransferRecipient = async (bankDetails: any) => {
  const response = await paystackApi.post('/transferrecipient', bankDetails);
  return response.data;
};

export const initiateTransfer = async (amount: number, recipient: string, reason?: string) => {
  const response = await paystackApi.post('/transfer', {
    source: 'balance',
    amount: amount * 100,
    recipient,
    reason,
  });
  return response.data;
};
