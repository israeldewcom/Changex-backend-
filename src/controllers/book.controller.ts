// ============================================================
// FILE: src/controllers/book.controller.ts (MERGED)
// Original functions kept intact + new advanced features
// ============================================================

import { Request, Response, NextFunction } from 'express';
import Book from '../models/Book.js';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { getIO } from '../socket.js';
import Notification from '../models/Notification.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

// ─── ORIGINAL FUNCTIONS (unchanged) ────────────────────────────────

export const createBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const { title, author, description, price, coverImage, fileUrl } = req.body;
    const book = await Book.create({
      title,
      author,
      description,
      price: price || 0,
      coverImage,
      fileUrl,
      uploadedBy: user._id,
    });
    res.status(201).json({ success: true, data: book });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const updateBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const book = await Book.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    res.json({ success: true, data: book });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const deleteBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    await Book.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Book deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const listAllBooks = async (req: Request, res: Response) => {
  try {
    const books = await Book.find().sort('-createdAt');
    res.json({ success: true, data: books });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const listBooks = async (req: Request, res: Response) => {
  try {
    const books = await Book.find({ isPublished: true }).sort('-createdAt');
    res.json({ success: true, data: books });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const getBook = async (req: Request, res: Response) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    let isPurchased = false;
    if (req.user) {
      const user = req.user as IUser;
      const purchase = await Transaction.findOne({
        userId: user._id,
        type: 'book_purchase',
        'metadata.bookId': book._id,
        status: 'completed',
      });
      isPurchased = !!purchase;
    }

    book.views += 1;
    await book.save();

    res.json({ success: true, data: { ...book.toObject(), isPurchased } });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const downloadBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    if (book.price > 0) {
      const purchased = await Transaction.findOne({
        userId: user._id,
        type: 'book_purchase',
        'metadata.bookId': book._id,
        status: 'completed',
      });
      if (!purchased) {
        return res.status(403).json({ success: false, message: 'You need to purchase this book first' });
      }
    }

    book.downloads += 1;
    await book.save();

    let downloadUrl = book.fileUrl;

    if (downloadUrl && downloadUrl.startsWith('/uploads/')) {
      const diskPath = path.join(process.cwd(), downloadUrl);
      if (fs.existsSync(diskPath)) {
        const fileName = `${book.title.replace(/[^a-zA-Z0-9 ]/g, ' ').trim()}.pdf`;
        return res.download(diskPath, fileName);
      } else {
        return res.status(404).json({ success: false, message: 'File not found on server' });
      }
    }

    if (downloadUrl && downloadUrl.startsWith('http')) {
      return res.redirect(downloadUrl);
    }

    return res.status(404).json({ success: false, message: 'No download file available' });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

export const purchaseBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { bookId } = req.body;
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    if (book.price === 0) return res.status(400).json({ success: false, message: 'This book is free' });

    const metadata = { type: 'book_purchase', bookId: book._id, userId: user._id };
    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      {
        email: user.email,
        amount: book.price * 100,
        currency: 'NGN',
        metadata,
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    res.json({
      success: true,
      data: {
        paymentUrl: response.data.data.authorization_url,
        reference: response.data.data.reference,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── NEW ADVANCED FEATURES (added without altering above) ──────────

// USER: Submit book for admin approval (Premium users)
export const submitBookForApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    
    if (!user.isPremium && !user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Premium subscription required to upload books' });
    }

    const { title, author, description, price, coverImage, fileUrl, affiliatePercent } = req.body;

    if (!title || !author || !fileUrl) {
      return res.status(400).json({ success: false, message: 'Title, author, and file URL are required' });
    }

    const book = await Book.create({
      title,
      author,
      description: description || '',
      price: price || 0,
      coverImage: coverImage || '',
      fileUrl,
      uploadedBy: user._id,
      isPublished: false,
      status: 'pending',
      affiliatePercent: affiliatePercent || 0,
    });

    const User = await import('../models/User.js').then(m => m.default);
    const admins = await User.find({ roles: 'admin' }).select('_id');
    for (const admin of admins) {
      getIO().to(`user:${admin._id}`).emit('book_submitted', {
        bookId: book._id,
        title: book.title,
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
      });
      await Notification.create({
        userId: admin._id,
        title: '📚 New Book Submission Pending',
        message: `${user.firstName} ${user.lastName} submitted a new book: "${book.title}" for approval.`,
        type: 'system',
        data: { bookId: book._id, type: 'book_submission' },
      });
    }

    await Notification.create({
      userId: user._id,
      title: '📚 Book Submitted for Approval',
      message: `Your book "${book.title}" has been submitted for admin approval. You will be notified once reviewed.`,
      type: 'system',
      data: { bookId: book._id },
    });

    res.status(201).json({ 
      success: true, 
      message: 'Book submitted for admin approval',
      data: book 
    });
  } catch (err) {
    next(err);
  }
};

// ADMIN: Get single book with uploader details
export const getBookById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const book = await Book.findById(req.params.id).populate('uploadedBy', 'firstName lastName email');
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    res.json({ success: true, data: book });
  } catch (err) {
    next(err);
  }
};

// ADMIN: Approve a submitted book
export const approveBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = req.user as IUser;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    if (book.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Book already approved' });
    }

    book.status = 'approved';
    book.isPublished = true;
    book.adminApprovedBy = admin._id;
    book.adminApprovedAt = new Date();
    await book.save();

    getIO().to(`user:${book.uploadedBy}`).emit('book_approved', {
      bookId: book._id,
      title: book.title,
    });

    await Notification.create({
      userId: book.uploadedBy,
      title: '📚 Book Approved!',
      message: `Your book "${book.title}" has been approved and is now live in the library!`,
      type: 'system',
      data: { bookId: book._id },
    });

    res.json({ success: true, data: book });
  } catch (err) {
    next(err);
  }
};

// ADMIN: Reject a submitted book with reason
export const rejectBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = req.user as IUser;
    const { reason } = req.body;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    if (book.status === 'rejected') {
      return res.status(400).json({ success: false, message: 'Book already rejected' });
    }

    book.status = 'rejected';
    book.isPublished = false;
    book.rejectionReason = reason || 'Not specified';
    book.adminApprovedBy = admin._id;
    book.adminApprovedAt = new Date();
    await book.save();

    getIO().to(`user:${book.uploadedBy}`).emit('book_rejected', {
      bookId: book._id,
      title: book.title,
      reason: book.rejectionReason,
    });

    await Notification.create({
      userId: book.uploadedBy,
      title: '📚 Book Rejected',
      message: `Your book "${book.title}" was rejected. Reason: ${book.rejectionReason}`,
      type: 'system',
      data: { bookId: book._id },
    });

    res.json({ success: true, data: book });
  } catch (err) {
    next(err);
  }
};

// USER: Get list of purchased books (library)
export const getPurchasedBooks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const transactions = await Transaction.find({
      userId: user._id,
      type: 'book_purchase',
      status: 'completed',
    }).select('metadata.bookId createdAt');

    const bookIds = transactions.map(t => t.metadata?.bookId).filter(Boolean);
    const books = await Book.find({ _id: { $in: bookIds }, isPublished: true });

    const booksWithPurchaseDate = books.map(book => {
      const tx = transactions.find(t => t.metadata?.bookId?.toString() === book._id.toString());
      return {
        ...book.toObject(),
        purchasedAt: tx?.createdAt || null,
      };
    });

    res.json({ success: true, data: booksWithPurchaseDate });
  } catch (err) {
    next(err);
  }
};

// USER: Verify book purchase manually (after payment)
export const verifyBookPurchase = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ success: false, message: 'Reference required' });

    const verification = await axios.get(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = verification.data.data;

    if (data.status !== 'success') {
      return res.status(400).json({ success: false, message: 'Payment not successful' });
    }

    const meta = data.metadata || {};
    const bookId = meta.bookId;

    if (!bookId) return res.status(400).json({ success: false, message: 'Book ID missing in metadata' });

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    const existing = await Transaction.findOne({
      userId: user._id,
      type: 'book_purchase',
      'metadata.bookId': book._id,
      status: 'completed',
    });
    if (existing) {
      return res.json({ success: true, message: 'Book already purchased' });
    }

    await Transaction.create({
      userId: user._id,
      type: 'book_purchase',
      amount: data.amount / 100,
      status: 'completed',
      reference,
      description: `Purchase of book: ${book.title}`,
      metadata: { bookId: book._id },
    });

    book.downloads = (book.downloads || 0) + 1;
    await book.save();

    getIO().to(`user:${user._id}`).emit('book_purchased', {
      bookId: book._id,
      title: book.title,
    });

    res.json({ success: true, message: 'Book purchased successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

// Track a book view (increment)
export const trackBookView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await Book.findByIdAndUpdate(id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ADMIN: Get overall book statistics
export const getBookStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const totalBooks = await Book.countDocuments();
    const freeBooks = await Book.countDocuments({ price: 0 });
    const paidBooks = await Book.countDocuments({ price: { $gt: 0 } });
    const totalDownloads = await Book.aggregate([{ $group: { _id: null, total: { $sum: '$downloads' } } }]);
    const totalViews = await Book.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);

    res.json({
      success: true,
      data: {
        totalBooks,
        freeBooks,
        paidBooks,
        totalDownloads: totalDownloads[0]?.total || 0,
        totalViews: totalViews[0]?.total || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};
