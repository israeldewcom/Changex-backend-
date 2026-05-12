import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';

const router = Router();
const ctrl = new AuthController();

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/refresh-token', ctrl.refreshToken);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.post('/logout', ctrl.logout);
router.get('/google', ctrl.googleAuth);
router.get('/google/callback', ctrl.googleCallback);
router.get('/github', ctrl.githubAuth);
router.get('/github/callback', ctrl.githubCallback);

export default router;
