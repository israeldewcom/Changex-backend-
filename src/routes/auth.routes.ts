import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';
import passport from 'passport';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// ─── GET /register – frontend pre‑check ─────────────────────────────
router.get('/register', (req, res) => {
  res.status(200).json({ success: true });
});

// ─── POST /register ──────────────────────────────────────────────────
router.post('/register', validate(registerSchema), authController.register);

// ─── Login (both GET and POST) ──────────────────────────────────────
router.post('/login', validate(loginSchema), authController.login);
router.get('/login', authController.loginGet); // keep for compatibility

// ─── Logout ──────────────────────────────────────────────────────────
router.post('/logout', authController.logout);

// ─── Password reset ──────────────────────────────────────────────────
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// ─── Change password (authenticated) ────────────────────────────────
router.put('/change-password', authenticate, authController.changePassword);

// ─── OAuth ────────────────────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login' }), authController.googleCallback);
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback', passport.authenticate('github', { session: false, failureRedirect: '/login' }), authController.githubCallback);

export default router;
