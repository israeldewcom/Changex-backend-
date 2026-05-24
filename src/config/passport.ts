// ============================================
// FILE: src/config/passport.ts (Complete – conditional OAuth)
// ============================================
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/User';
import jwt from 'jsonwebtoken';
import { config } from './index';
import { logger } from '../utils/logger';

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.FRONTEND_URL}/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ email: profile.emails?.[0].value });
          if (!user) {
            user = new User({
              email: profile.emails?.[0].value,
              firstName: profile.name?.givenName || '',
              lastName: profile.name?.familyName || '',
              displayName: profile.displayName,
              avatar: profile.photos?.[0]?.value,
              emailVerified: true,
              referralCode: require('crypto').randomBytes(6).toString('hex').toUpperCase(),
              roles: ['user'],
            });
            await user.save();
          }
          const token = jwt.sign({ userId: user._id }, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiry });
          return done(null, { user, token });
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
  logger.info('Google OAuth strategy registered');
} else {
  logger.warn('Google OAuth credentials missing – strategy not registered');
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${process.env.FRONTEND_URL}/auth/github/callback`,
        scope: 'user:email',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || `${profile.username}@github.com`;
          let user = await User.findOne({ email });
          if (!user) {
            user = new User({
              email,
              firstName: profile.displayName || profile.username,
              lastName: '',
              displayName: profile.displayName || profile.username,
              avatar: profile.photos?.[0]?.value,
              emailVerified: true,
              referralCode: require('crypto').randomBytes(6).toString('hex').toUpperCase(),
              roles: ['user'],
            });
            await user.save();
          }
          const token = jwt.sign({ userId: user._id }, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiry });
          return done(null, { user, token });
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
  logger.info('GitHub OAuth strategy registered');
} else {
  logger.warn('GitHub OAuth credentials missing – strategy not registered');
}

passport.serializeUser((user: any, done) => done(null, user.user?._id || user._id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
