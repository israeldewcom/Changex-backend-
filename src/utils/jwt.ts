import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
}

const getAccessSecret = (): string => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('JWT_ACCESS_SECRET environment variable is not set');
  }
  return secret;
};

export const signAccessToken = (payload: TokenPayload, expiresIn: string = '30d'): string => {
  const secret = getAccessSecret();
  return jwt.sign(payload, secret, { expiresIn } as any);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  const secret = getAccessSecret();
  return jwt.verify(token, secret) as TokenPayload;
};
