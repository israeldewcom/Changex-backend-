// ============================================================
// FILE: src/controllers/book.controller.ts
// ============================================================

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import Book from '../models/Book.js';
import Transaction, { TransactionType, TransactionStatus } from '../models/Transaction.js';
import User, { IUser } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { sendResponse } from '../utils/response.js';
import config from '../config/index.js';

// ─── Utility: resolve file path ──────────────────────────────
const resolveFilePath = (fileUrl: string): string | null => {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('/uploads/')) {
    const diskPath = path.join(process.cwd(), fileUrl);
    return fs.existsSync(diskPath) ? diskPath : null;
  }
  return null;
};

// ─── Services (business logic) ──────────────────────────────
class BookService {
  static async create(data: any, userId: string) {
    return await Book.create({
      ...data,
      uploadedBy: userId,
    });
  }

  static async update(id: string, data: any) {
    const book = await Book.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!book) throw new AppError('Book not found', 404);
    return book;
  }

  static async delete(id: string) {
    const book = await Book.findByIdAndDelete(id);
    if (!book) throw new AppError('Book not found', 404);
    return book;
  }

  static async findAllPublished() {
    return await Book.find({ isPublished: true }).sort('-createdAt');
  }

  static async findAll() {
    return await Book.find().sort('-createdAt');
  }

  static async findById(id: string, userId?: string) {
    const book = await Book.findById(id);
    if (!book) throw new AppError('Book not found', 404);

    // Increment views
    book.views += 1;
    await book.save();

    // Check if user purchased
    let isPurchased = false;
    if (userId) {
      const purchase = await Transaction.findOne({
        userId,
        type: TransactionType.BOOK_PURCHASE,
        'metadata.bookId': book._id,
        status: TransactionStatus.COMPLETED,
      });
      isPurchased = !!purchase;
    }

    return { book, isPurchased };
  }

  static async download(id: string, userId: string) {
    const book = await Book.findById(id);
    if (!book) throw new AppError('Book not found', 404);

    // Check purchase for paid books
    if (book.price > 0) {
      const purchased = await Transaction.findOne({
        userId,
        type: TransactionType.BOOK_PURCHASE,
        'metadata.bookId': book._id,
        status: TransactionStatus.COMPLETED,
      });
      if (!purchased) {
        throw new AppError('You need to purchase this book first', 403);
      }
    }

    // Increment download count
    book.downloads += 1;
    await book.save();

    // Resolve file
    const fileUrl = book.fileUrl;
    if (!fileUrl) throw new AppError('No download file available', 404);

    // Check local disk
    const diskPath = resolveFilePath(fileUrl);
    if (diskPath) {
      return { type: 'file', path: diskPath, filename: `${book.title.replace(/[^a-zA-Z0-9 ]/g, ' ').trim()}.pdf` };
    }

    // Remote URL (Cloudinary, etc.)
    if (fileUrl.startsWith('http')) {
      return { type: 'redirect', url: fileUrl };
    }

    throw new AppError('No download file available', 404);
  }

  static async initializePurchase(userId: string, bookId: string) {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const book = await Book.findById(bookId);
    if (!book) throw new AppError('Book not found', 404);
    if (book.price === 0) throw new AppError('This book is free', 400);

    // Create pending transaction record
    const reference = `PAY-${uuidv4()}`;
    const transaction = await Transaction.create({
      userId: user._id,
      type: TransactionType.BOOK_PURCHASE,
      amount: book.price,
      status: TransactionStatus.PENDING,
      metadata: { bookId: book._id },
      reference,
    });

    // Initialize Paystack
    const payload = {
      email: user.email,
      amount: book.price * 100, // in kobo
      currency: 'NGN',
      reference,
      metadata: { transactionId: transaction._id.toString() },
    };

    const response = await axios.post(
      `${config.paystack.baseUrl}/transaction/initialize`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data.status) {
      throw new AppError('Payment initialization failed', 500);
    }

    return {
      paymentUrl: response.data.data.authorization_url,
      reference: response.data.data.reference,
    };
  }
}

// ─── Controllers ──────────────────────────────────────────────

export const createBook = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IUser;
  const book = await BookService.create(req.body, user._id);
  sendResponse(res, 201, book);
});

export const updateBook = catchAsync(async (req: Request, res: Response) => {
  const book = await BookService.update(req.params.id, req.body);
  sendResponse(res, 200, book);
});

export const deleteBook = catchAsync(async (req: Request, res: Response) => {
  await BookService.delete(req.params.id);
  sendResponse(res, 200, { message: 'Book deleted successfully' });
});

export const listBooks = catchAsync(async (req: Request, res: Response) => {
  const books = await BookService.findAllPublished();
  sendResponse(res, 200, books);
});

export const listAllBooks = catchAsync(async (req: Request, res: Response) => {
  const books = await BookService.findAll();
  sendResponse(res, 200, books);
});

export const getBook = catchAsync(async (req: Request, res: Response) => {
  const userId = (req.user as IUser)?._id;
  const { book, isPurchased } = await BookService.findById(req.params.id, userId);
  sendResponse(res, 200, { ...book.toObject(), isPurchased });
});

export const downloadBook = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IUser;
  const result = await BookService.download(req.params.id, user._id);

  if (result.type === 'file') {
    return res.download(result.path, result.filename);
  } else if (result.type === 'redirect') {
    return res.redirect(result.url);
  }
});

export const purchaseBook = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IUser;
  const { bookId } = req.body;
  const data = await BookService.initializePurchase(user._id, bookId);
  sendResponse(res, 200, data);
});

// ─── Webhook handler (for Paystack) ───────────────────────────
export const handlePaystackWebhook = catchAsync(async (req: Request, res: Response) => {
  const event = req.body;
  // Verify signature (implement signature verification using config.paystack.secretKey)
  // ...

  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    const transaction = await Transaction.findOne({ reference });
    if (transaction && transaction.status === TransactionStatus.PENDING) {
      transaction.status = TransactionStatus.COMPLETED;
      transaction.paymentData = event.data;
      await transaction.save();

      // Optionally grant access or perform other actions
    }
  }

  res.sendStatus(200);
});
