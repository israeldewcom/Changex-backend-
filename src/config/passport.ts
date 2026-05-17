import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { config } from './index';
import { User } from '../models/User';

// JWT Strategy (for socket.io or alternative auth)
passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.jwt.accessSecret,
}, async (payload, done) => {
  try {
    const user = await User.findById(payload.userId);
    if (user) {
      return done(null, user);
    }
    return done(null, false);
  } catch (error) {
    return done(error, false);
  }
}));

// Google OAuth Strategy (optional – configure if you have credentials)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${config.frontendUrl}/api/v1/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ email: profile.emails?.[0]?.value });
      if (!user) {
        // Create new user if doesn't exist
        user = new User({
          email: profile.emails?.[0]?.value,
          firstName: profile.name?.givenName || '',
          lastName: profile.name?.familyName || '',
          displayName: profile.displayName,
          emailVerified: true,
          referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        });
        await user.save();
      }
      return done(null, user);
    } catch (error) {
      return done(error as Error, undefined);
    }
  }));
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${config.frontendUrl}/api/v1/auth/github/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ email: profile.emails?.[0]?.value });
      if (!user) {
        const email = profile.emails?.[0]?.value || `${profile.username}@github.user`;
        user = new User({
          email,
          firstName: profile.displayName?.split(' ')[0] || profile.username || '',
          lastName: profile.displayName?.split(' ')[1] || '',
          displayName: profile.displayName || profile.username || '',
          emailVerified: !!profile.emails?.[0]?.value,
          referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        });
        await user.save();
      }
      return done(null, user);
    } catch (error) {
      return done(error as Error, undefined);
    }
  }));
}

// Serialize/deserialize user (minimal)
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
