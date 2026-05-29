// src/utils/jwt.ts
import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
}

const FALLBACK_ACCESS_SECRET = 'changex_access_fallback_2026_secure';
const FALLBACK_REFRESH_SECRET = 'changex_refresh_fallback_2026_secure';

const getAccessSecret = (): string => {
  const secret = process.env.JWT_ACCESS_SECRET;
  return secret && secret.trim() !== '' ? secret : FALLBACK_ACCESS_SECRET;
};

const getRefreshSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  return secret && secret.trim() !== '' ? secret : FALLBACK_REFRESH_SECRET;
};

export const signAccessToken = (payload: TokenPayload): string => {
  const secret = getAccessSecret() as any;
  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  } as any);
};

export const signRefreshToken = (payload: TokenPayload): string => {
  const secret = getRefreshSecret() as any;
  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d',
  } as any);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  const secret = getAccessSecret() as any;
  return jwt.verify(token, secret) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  const secret = getRefreshSecret() as any;
  return jwt.verify(token, secret) as TokenPayload;
};
