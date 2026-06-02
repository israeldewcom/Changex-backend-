import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
}

const FALLBACK_ACCESS_SECRET = 'changex_access_fallback_2026_secure';

const getAccessSecret = (): string => {
  const secret = process.env.JWT_ACCESS_SECRET;
  return secret && secret.trim() !== '' ? secret : FALLBACK_ACCESS_SECRET;
};

export const signAccessToken = (payload: TokenPayload, expiresIn: string = '30d'): string => {
  const secret = getAccessSecret() as any;
  return jwt.sign(payload, secret, { expiresIn } as any);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  const secret = getAccessSecret() as any;
  return jwt.verify(token, secret) as TokenPayload;
};
