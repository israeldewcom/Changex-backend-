// ============================================
// FILE: src/routes/marketplace.ts (new)
// ============================================
import { Router } from 'express';
import { MarketplaceController } from '../controllers/MarketplaceController';
import { authenticate, requireCreator } from '../middleware/auth';
import { validateCreateProduct, validatePagination } from '../middleware/validation';

const router = Router();
const marketplaceController = new MarketplaceController();

router.get('/', validatePagination, marketplaceController.getProducts);
router.get('/:id', marketplaceController.getProductById);
router.use(authenticate);
router.post('/', requireCreator, validateCreateProduct, marketplaceController.createProduct);
router.post('/orders', marketplaceController.createOrder);
router.get('/orders/my', marketplaceController.getMyOrders);

export default router;
