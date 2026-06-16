import { Router } from 'express';
import * as interactiveController from '../controllers/interactive.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// Public - anyone can view interactive materials
router.get('/lesson/:lessonId', interactiveController.getLessonMaterials);

// Protected - only instructors/admins can modify
router.use(authenticate, authorize('instructor', 'admin'));
router.post('/lesson/:lessonId', interactiveController.addInteractiveMaterial);
router.put('/:id', interactiveController.updateMaterial);
router.delete('/:id', interactiveController.deleteMaterial);
router.post('/lesson/:lessonId/reorder', interactiveController.reorderMaterials);

export default router;
