import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';
import { validateRegistration, validateLogin, validateResetPassword, validatePasswordChange } from '../middleware/validation';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';

const router = Router();
const authController = new AuthController();

// ==================== PUBLIC ROUTES ====================
router.post('/register', authRateLimit, validateRegistration, authController.register);
router.post('/login', authRateLimit, validateLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.get('/verify-email', authController.verifyEmail);
router.post('/forgot-password', authRateLimit, authController.forgotPassword);
router.post('/reset-password', authRateLimit, validateResetPassword, authController.resetPassword);

// ==================== PROTECTED ROUTES ====================
router.post('/logout', authenticate, authController.logout);
router.post('/change-password', authenticate, validatePasswordChange, authController.changePassword);
router.post('/2fa/enable', authenticate, authController.enableTwoFactor);
router.post('/2fa/disable', authenticate, authController.disableTwoFactor);

// ==================== TEMPORARY ADMIN FIX (REMOVE AFTER USE) ====================
router.post('/fix-admin', async (req, res) => {
  try {
    const newHash = await bcrypt.hash('Admin@123', 12);
    const result = await User.updateOne(
      { email: 'admin@changexacademy.com' },
      {
        $set: {
          password: newHash,
          isActive: true,
          isBanned: false,
          emailVerified: true,
          roles: ['admin'],
          isApprovedInstructor: true
        }
      },
      { upsert: true }
    );
    res.json({ success: true, message: 'Admin password reset to Admin@123', result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
