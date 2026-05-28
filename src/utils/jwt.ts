import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
}

// Fallback secrets – CHANGE THESE IN PRODUCTION after env vars work
const FALLBACK_ACCESS_SECRET = 'changex_access_fallback_2026_secure';
const FALLBACK_REFRESH_SECRET = 'changex_refresh_fallback_2026_secure';

const getAccessSecret = (): string => {
  return process.env.JWT_ACCESS_SECRET || FALLBACK_ACCESS_SECRET;
};

const getRefreshSecret = (): string => {
  return process.env.JWT_REFRESH_SECRET || FALLBACK_REFRESH_SECRET;
};

export const signAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });
};

export const signRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d',
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, getAccessSecret()) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, getRefreshSecret()) as TokenPayload;
};
