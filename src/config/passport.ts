import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/User';
import { config } from './index';
import jwt from 'jsonwebtoken';

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: `${process.env.FRONTEND_URL}/api/v1/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ email: profile.emails?.[0].value });
    if (!user) {
      user = await User.create({
        email: profile.emails?.[0].value,
        firstName: profile.name?.givenName || '',
        lastName: profile.name?.familyName || '',
        displayName: profile.displayName,
        referralCode: Math.random().toString(36).substring(2, 10).toUpperCase(),
        emailVerified: true,
        isActive: true,
        setupDone: false
      });
    }
    const token = jwt.sign({ userId: user._id }, config.jwt.accessSecret, { expiresIn: '15m' });
    return done(null, { user, token });
  } catch (err) { return done(err as any); }
}));

passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  callbackURL: `${process.env.FRONTEND_URL}/api/v1/auth/github/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ email: profile.emails?.[0].value });
    if (!user) {
      user = await User.create({
        email: profile.emails?.[0].value,
        firstName: profile.displayName.split(' ')[0] || '',
        lastName: profile.displayName.split(' ').slice(1).join(' ') || '',
        displayName: profile.displayName,
        referralCode: Math.random().toString(36).substring(2, 10).toUpperCase(),
        emailVerified: true,
        isActive: true,
        setupDone: false
      });
    }
    const token = jwt.sign({ userId: user._id }, config.jwt.accessSecret, { expiresIn: '15m' });
    return done(null, { user, token });
  } catch (err) { return done(err as any); }
}));

export default passport;
