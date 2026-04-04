// ============================================
// FILE: src/controllers/MarketplaceController.ts (new)
// ============================================
import { Request, Response } from 'express';
import { Marketplace, Order } from '../models';
import { MarketplaceService } from '../services/MarketplaceService';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';

export class MarketplaceController {
  private marketplaceService: MarketplaceService;
  constructor() { this.marketplaceService = MarketplaceService.getInstance(); }

  getProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, category, search, minPrice, maxPrice } = req.query;
      const query: any = { published: true };
      if (category) query.category = category;
      if (search) query.$text = { $search: search as string };
      if (minPrice || maxPrice) { query.price = {}; if (minPrice) query.price.$gte = Number(minPrice); if (maxPrice) query.price.$lte = Number(maxPrice); }
      const skip = (Number(page) - 1) * Number(limit);
      const [products, total] = await Promise.all([Marketplace.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('seller', 'firstName lastName displayName'), Marketplace.countDocuments(query)]);
      res.json({ success: true, data: { products, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getProductById = async (req: Request, res: Response): Promise<void> => {
    try {
      const product = await Marketplace.findById(req.params.id).populate('seller', 'firstName lastName displayName avatar');
      if (!product) { res.status(404).json({ success: false, message: 'Product not found' }); return; }
      res.json({ success: true, data: product });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  createProduct = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const userId = (req as any).user?.userId;
      const productData = { ...req.body, seller: userId, slug: req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
      const product = new Marketplace(productData);
      await product.save();
      res.status(201).json({ success: true, data: product, message: 'Product created successfully' });
    } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
  };

  createOrder = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const userId = (req as any).user?.userId;
      const { items, shippingAddress, paymentMethod } = req.body;
      const result = await this.marketplaceService.createOrder(userId, items, shippingAddress, paymentMethod);
      res.json({ success: true, data: result });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
  };

  getMyOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const orders = await Order.find({ buyer: userId }).sort({ createdAt: -1 }).populate('items.product');
      res.json({ success: true, data: orders });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };
}
