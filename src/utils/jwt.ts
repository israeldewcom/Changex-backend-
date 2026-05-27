import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
interface TokenPayload { userId: string; email: string; }
export const signAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' } as SignOptions);
};
export const signRefreshToken = (payload: TokenPayload) => {
  const token = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d' } as SignOptions);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
};
export const verifyAccessToken = (token: string): TokenPayload => jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as TokenPayload;
export const verifyRefreshToken = (token: string): TokenPayload => jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
