import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/User';
import { config } from './index';
import { logger } from '../utils/logger';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${config.frontendUrl}/auth/google/callback`,
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
            avatar: profile.photos?.[0].value,
            emailVerified: true,
            referralCode: require('crypto').randomBytes(6).toString('hex').toUpperCase(),
            roles: ['user'],
            isActive: true,
          });
          await user.save();
        }
        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: `${config.frontendUrl}/auth/github/callback`,
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
            isActive: true,
          });
          await user.save();
        }
        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
