import { Router } from 'express';
import { CurrencyController } from '../controllers/CurrencyController';

const router = Router();
const currencyController = new CurrencyController();

router.get('/rates', currencyController.getRates);

export default router;
