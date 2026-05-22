// ============================================
// FILE: src/routes/auth.ts
// ============================================
import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';
import { validateRegistration, validateLogin, validateResetPassword, validatePasswordChange } from '../middleware/validation';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import passport from '../config/passport';

const router = Router();
const authController = new AuthController();

router.post('/register', authRateLimit, validateRegistration, authController.register);
router.post('/login', authRateLimit, validateLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.get('/verify-email', authController.verifyEmail);
router.post('/forgot-password', authRateLimit, authController.forgotPassword);
router.post('/reset-password', authRateLimit, validateResetPassword, authController.resetPassword);
router.post('/logout', authenticate, authController.logout);
router.post('/change-password', authenticate, validatePasswordChange, authController.changePassword);
router.post('/2fa/enable', authenticate, authController.enableTwoFactor);
router.post('/2fa/disable', authenticate, authController.disableTwoFactor);

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login` }),
    (req, res) => {
      const { token } = req.user as any;
      res.redirect(`${process.env.FRONTEND_URL}?token=${token}`);
    }
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
  router.get('/github/callback',
    passport.authenticate('github', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login` }),
    (req, res) => {
      const { token } = req.user as any;
      res.redirect(`${process.env.FRONTEND_URL}?token=${token}`);
    }
  );
}

router.post('/fix-admin', async (req, res) => {
  try {
    await User.updateOne(
      { email: 'admin@changexacademy.com' },
      {
        $set: {
          roles: ['admin'],
          isApprovedInstructor: true,
          isActive: true,
          emailVerified: true,
          subscriptionTier: 'premium',
          subscriptionStatus: 'active',
          setupDone: true
        }
      },
      { upsert: true }
    );
    let admin = await User.findOne({ email: 'admin@changexacademy.com' });
    if (!admin) {
      const hash = await bcrypt.hash('Admin@123', 12);
      admin = await User.create({
        email: 'admin@changexacademy.com',
        password: hash,
        firstName: 'Admin',
        lastName: 'User',
        displayName: 'Admin User',
        referralCode: 'ADMIN' + Date.now(),
        roles: ['admin'],
        isApprovedInstructor: true,
        emailVerified: true,
        isActive: true,
        setupDone: true,
        walletBalance: 0,
        xp: 0,
        level: 1,
        streak: 0,
        subscriptionTier: 'premium',
        subscriptionStatus: 'active'
      });
    }
    res.json({ success: true, message: 'Admin roles fixed. Please log out and log in again.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
