import { Express } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy, Profile as GitHubProfile } from 'passport-github2';
import User from '../models/User.js';
import { generateReferralCode } from '../utils/referralCode.js';

export const initializePassport = (app: Express) => {
  app.use(passport.initialize());

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: process.env.GOOGLE_CALLBACK_URL!,
        },
        async (accessToken: string, refreshToken: string, profile: GoogleProfile, done: any) => {
          try {
            let user = await User.findOne({ email: profile.emails?.[0].value });
            if (!user) {
              user = await User.create({
                email: profile.emails?.[0].value,
                firstName: profile.name?.givenName || '',
                lastName: profile.name?.familyName || '',
                avatarUrl: profile.photos?.[0]?.value,
                referralCode: generateReferralCode(),
              });
            }
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );
  }

  if (process.env.GITHUB_CLIENT_ID) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          callbackURL: process.env.GITHUB_CALLBACK_URL!,
          scope: ['user:email'],
        },
        async (accessToken: string, refreshToken: string, profile: GitHubProfile, done: any) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email associated with GitHub account'));
            }
            let user = await User.findOne({ email });
            if (!user) {
              user = await User.create({
                email,
                firstName: profile.displayName?.split(' ')[0] || '',
                lastName: profile.displayName?.split(' ')[1] || '',
                avatarUrl: profile.photos?.[0]?.value,
                referralCode: generateReferralCode(),
              });
            }
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );
  }
};
