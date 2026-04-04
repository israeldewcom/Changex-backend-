// ============================================
// FILE: src/routes/admin.ts (new)
// ============================================
import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
const adminController = new AdminController();

router.use(authenticate, requireAdmin);
router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', adminController.getUsers);
router.patch('/users/:userId', adminController.updateUserStatus);

export default router;
