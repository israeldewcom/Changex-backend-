// ============================================================
// FILE: src/services/sms.ts (NEW)
// ============================================================

import twilio from 'twilio';
import logger from '../utils/logger.js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export const sendSMS = async (to: string, body: string): Promise<boolean> => {
  if (!client) {
    logger.warn('Twilio not configured – SMS not sent');
    return false;
  }
  if (!to || to.length < 10) {
    logger.warn('Invalid phone number – SMS not sent');
    return false;
  }
  try {
    const message = await client.messages.create({
      body,
      from: twilioPhone,
      to,
    });
    logger.info(`SMS sent to ${to}: ${message.sid}`);
    return true;
  } catch (error) {
    logger.error(`SMS failed to ${to}:`, error);
    return false;
  }
};
