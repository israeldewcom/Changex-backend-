// ============================================
// FILE: src/config/passport.ts (New for OAuth)
// ============================================
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/User';
import crypto from 'crypto';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: `${process.env.API_URL}/api/v1/auth/google/callback`
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

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    callbackURL: `${process.env.API_URL}/api/v1/auth/github/callback`
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
