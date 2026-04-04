// ============================================
// FILE: src/models/Marketplace.ts (unchanged)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  title: string;
  slug: string;
  description: string;
  price: number;
  discountPrice?: number;
  currency: string;
  category: string;
  subcategory: string;
  type: 'digital' | 'physical';
  seller: mongoose.Types.ObjectId;
  images: string[];
  thumbnail: string;
  fileUrl?: string;
  shippingDetails?: {
    weight: number;
    dimensions: string;
    countries: string[];
    cost: number;
  };
  inventory: number;
  soldCount: number;
  rating: number;
  reviewCount: number;
  tags: string[];
  featured: boolean;
  published: boolean;
  commission: {
    platform: number;
    affiliate: number;
    creator: number;
  };
  totalRevenue: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrder extends Document {
  orderNumber: string;
  buyer: mongoose.Types.ObjectId;
  seller: mongoose.Types.ObjectId;
  items: Array<{
    product: mongoose.Types.ObjectId;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  currency: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentMethod: 'stripe' | 'paystack' | 'wallet';
  paymentReference?: string;
  shippingAddress: {
    fullName: string;
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    phone: string;
  };
  trackingNumber?: string;
  deliveredAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true, index: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    currency: { type: String, default: 'NGN' },
    category: { type: String, required: true, index: true },
    subcategory: { type: String },
    type: { type: String, enum: ['digital', 'physical'], required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    images: [{ type: String }],
    thumbnail: { type: String, required: true },
    fileUrl: { type: String },
    shippingDetails: {
      weight: { type: Number },
      dimensions: { type: String },
      countries: [{ type: String }],
      cost: { type: Number },
    },
    inventory: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    tags: [{ type: String, index: true }],
    featured: { type: Boolean, default: false },
    published: { type: Boolean, default: false, index: true },
    commission: {
      platform: { type: Number, default: 10 },
      affiliate: { type: Number, default: 20 },
      creator: { type: Number, default: 70 },
    },
    totalRevenue: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [{
      product: { type: Schema.Types.ObjectId, ref: 'Marketplace', required: true },
      quantity: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true },
      total: { type: Number, required: true },
    }],
    subtotal: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    status: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'], default: 'pending' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    paymentMethod: { type: String, enum: ['stripe', 'paystack', 'wallet'], required: true },
    paymentReference: { type: String },
    shippingAddress: {
      fullName: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true },
      postalCode: { type: String, required: true },
      phone: { type: String, required: true },
    },
    trackingNumber: { type: String },
    deliveredAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
  },
  { timestamps: true }
);

ProductSchema.index({ title: 'text', description: 'text', tags: 'text' });
ProductSchema.index({ price: 1, rating: -1 });
ProductSchema.index({ createdAt: -1 });

OrderSchema.index({ buyer: 1, createdAt: -1 });
OrderSchema.index({ seller: 1, status: 1 });
OrderSchema.index({ orderNumber: 1 });

export const Marketplace = mongoose.model<IProduct>('Marketplace', ProductSchema);
export const Order = mongoose.model<IOrder>('Order', OrderSchema);
