import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';
import { validateRegistration, validateLogin, validateResetPassword, validatePasswordChange } from '../middleware/validation';

const router = Router();
const authController = new AuthController();

router.post('/register', authRateLimit, validateRegistration, authController.register);
router.post('/login', authRateLimit, validateLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);
router.get('/verify-email', authController.verifyEmail);
router.post('/forgot-password', authRateLimit, authController.forgotPassword);
router.post('/reset-password', authRateLimit, validateResetPassword, authController.resetPassword);
router.post('/change-password', authenticate, validatePasswordChange, authController.changePassword);
router.post('/2fa/enable', authenticate, authController.enableTwoFactor);
router.post('/2fa/disable', authenticate, authController.disableTwoFactor);

export default router;
