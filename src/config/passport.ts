// ============================================
// FILE: src/config/passport.ts (Complete - with environment checks)
// ============================================
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/User';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// Only initialize Google Strategy if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.API_URL || process.env.FRONTEND_URL}/api/v1/auth/google/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ email: profile.emails?.[0].value });
        if (!user) {
          user = await User.create({
            email: profile.emails?.[0].value,
            firstName: profile.name?.givenName || '',
            lastName: profile.name?.familyName || '',
            displayName: profile.displayName,
            emailVerified: true,
            referralCode: crypto.randomBytes(6).toString('hex').toUpperCase(),
            isActive: true
          });
        }
        return done(null, user);
      } catch (err) {
        return done(err as any);
      }
    }
  ));
  logger.info('Google OAuth strategy initialized');
} else {
  logger.warn('Google OAuth credentials missing – Google login disabled');
}

// Only initialize GitHub Strategy if credentials are provided
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${process.env.API_URL || process.env.FRONTEND_URL}/api/v1/auth/github/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || `${profile.username}@github.com`;
        let user = await User.findOne({ email });
        if (!user) {
          user = await User.create({
            email,
            firstName: profile.displayName || profile.username,
            lastName: '',
            displayName: profile.displayName || profile.username,
            emailVerified: true,
            referralCode: crypto.randomBytes(6).toString('hex').toUpperCase(),
            isActive: true
          });
        }
        return done(null, user);
      } catch (err) {
        return done(err as any);
      }
    }
  ));
  logger.info('GitHub OAuth strategy initialized');
} else {
  logger.warn('GitHub OAuth credentials missing – GitHub login disabled');
}

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

export default passport;
