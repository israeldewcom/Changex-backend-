import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';
import { validateRegistration, validateLogin, validateResetPassword, validatePasswordChange } from '../middleware/validation';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import jwt from 'jsonwebtoken';
import { config } from '../config';

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

// Temporary admin fix – call once after deployment, then remove
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
          subscriptionStatus: 'active'
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
