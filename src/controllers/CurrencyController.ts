import { Request, Response } from 'express';

export class CurrencyController {
  // Static fallback rates (replace with live API in production)
  private static rates = {
    NGN: 1,
    USD: 0.00062,
    EUR: 0.00058,
    GBP: 0.00050,
  };

  getRates = async (req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: CurrencyController.rates, base: 'NGN' });
  };
}
