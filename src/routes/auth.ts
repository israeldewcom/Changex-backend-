import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import { validateRegistration, validateLogin, validatePasswordReset } from '../middleware/validation';

const router = Router();
const authController = new AuthController();

// ── Public routes ──
router.post('/register', validateRegistration, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', validatePasswordReset, authController.resetPassword);
router.post('/logout', authenticate, authController.logout);

// ── OAuth routes ──
router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);
router.get('/github', authController.githubAuth);
router.get('/github/callback', authController.githubCallback);

export default router;
