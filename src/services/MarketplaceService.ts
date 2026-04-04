// ============================================
// FILE: src/services/MarketplaceService.ts (new)
// ============================================
import { Marketplace, Order, User, Transaction } from '../models';
import { PaymentService } from './PaymentService';
import { EarningEngine } from './EarningEngine';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';

export class MarketplaceService {
  private static instance: MarketplaceService;
  private paymentService: PaymentService;
  private earningEngine: EarningEngine;

  private constructor() {
    this.paymentService = PaymentService.getInstance();
    this.earningEngine = EarningEngine.getInstance();
  }

  static getInstance(): MarketplaceService {
    if (!MarketplaceService.instance) MarketplaceService.instance = new MarketplaceService();
    return MarketplaceService.instance;
  }

  async createOrder(buyerId: string, items: Array<{ productId: string; quantity: number }>, shippingAddress: any, paymentMethod: 'wallet' | 'stripe' | 'paystack'): Promise<any> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      let subtotal = 0;
      const orderItems = [];
      for (const item of items) {
        const product = await Marketplace.findById(item.productId).session(session);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        if (product.inventory < item.quantity) throw new Error(`Insufficient inventory for ${product.title}`);
        const total = product.price * item.quantity;
        subtotal += total;
        orderItems.push({ product: product._id, quantity: item.quantity, price: product.price, total });
      }
      const shippingCost = 0; // Calculate based on address/products
      const tax = subtotal * 0.075; // Example 7.5% VAT
      const total = subtotal + shippingCost + tax;
      if (paymentMethod === 'wallet') {
        const user = await User.findById(buyerId).session(session);
        if (!user || user.walletBalance < total) throw new Error('Insufficient wallet balance');
        user.walletBalance -= total;
        await user.save({ session });
      }
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const order = new Order({
        orderNumber,
        buyer: buyerId,
        seller: orderItems[0].product.seller, // For multi‑seller orders need split logic
        items: orderItems,
        subtotal,
        shippingCost,
        tax,
        total,
        paymentMethod,
        shippingAddress,
        status: 'pending',
        paymentStatus: paymentMethod === 'wallet' ? 'paid' : 'pending',
      });
      await order.save({ session });
      for (const item of orderItems) {
        await Marketplace.findByIdAndUpdate(item.product, { $inc: { inventory: -item.quantity, soldCount: item.quantity } }, { session });
      }
      if (paymentMethod === 'wallet') {
        // Record transaction
        const transaction = new Transaction({
          user: buyerId,
          type: 'purchase',
          subtype: 'marketplace',
          amount: total,
          currency: 'NGN',
          status: 'completed',
          description: `Order ${orderNumber}`,
          reference: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          paymentMethod: 'wallet',
          completedAt: new Date(),
        });
        await transaction.save({ session });
        order.paymentStatus = 'paid';
        order.paymentReference = transaction.reference;
        await order.save({ session });
        // Distribute earnings to seller and platform
        const sellerAmount = total * 0.7; // 70% to seller
        const platformAmount = total * 0.1;
        const affiliateAmount = total * 0.2;
        await this.earningEngine.addToWallet(order.seller.toString(), sellerAmount, 'commission', { type: 'marketplace_sale', orderId: order._id }, session);
        await this.earningEngine.addToWallet('platform', platformAmount, 'platform_fee', { type: 'marketplace_fee', orderId: order._id }, session);
        // Affiliate distribution would go here
      }
      await session.commitTransaction();
      if (paymentMethod !== 'wallet') {
        // Return payment intent/url
        const user = await User.findById(buyerId);
        if (paymentMethod === 'stripe') {
          const { clientSecret, paymentIntentId } = await this.paymentService.createStripePaymentIntent(buyerId, total, 'NGN', { type: 'marketplace_order', orderId: order._id.toString() });
          return { order, clientSecret, paymentIntentId };
        } else {
          const url = await this.paymentService.createPaystackPaymentUrl(buyerId, total, user!.email, { type: 'marketplace_order', orderId: order._id.toString() });
          return { order, paymentUrl: url };
        }
      }
      return { order, success: true };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getSellerOrders(sellerId: string, page = 1, limit = 20): Promise<any> {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find({ seller: sellerId }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('buyer', 'firstName lastName email'),
      Order.countDocuments({ seller: sellerId }),
    ]);
    return { orders, total, page, limit };
  }

  async updateOrderStatus(orderId: string, sellerId: string, status: string, trackingNumber?: string): Promise<Order> {
    const order = await Order.findOne({ _id: orderId, seller: sellerId });
    if (!order) throw new Error('Order not found');
    order.status = status as any;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (status === 'delivered') order.deliveredAt = new Date();
    if (status === 'cancelled') order.cancelledAt = new Date();
    await order.save();
    return order;
  }
}
