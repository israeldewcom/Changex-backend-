// ============================================================
// FILE: src/controllers/book.controller.ts (FIXED – getBook permissions)
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
import User from '../models/User.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

// ─── USER SUBMIT BOOK FOR APPROVAL (Premium users) ──────────────
export const submitBookForApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    
    // Check if user is premium
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
      approvalStatus: 'pending', // Require admin approval
      affiliatePercent: affiliatePercent || 0,
    });

    // Notify all admins
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

// ─── ADMIN: CREATE BOOK (Direct upload, auto‑approved) ──────────────
export const createBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const { title, author, description, price, coverImage, fileUrl, affiliatePercent, isPublished } = req.body;
    
    const book = await Book.create({
      title,
      author,
      description: description || '',
      price: price || 0,
      coverImage: coverImage || '',
      fileUrl,
      uploadedBy: user._id,
      isPublished: isPublished !== undefined ? isPublished : true,
      approvalStatus: 'approved', // Auto-approved
      affiliatePercent: affiliatePercent || 0,
    });

    // Notify all admins (optional)
    const admins = await User.find({ roles: 'admin' }).select('_id');
    for (const admin of admins) {
      getIO().to(`user:${admin._id}`).emit('book_created', {
        bookId: book._id,
        title: book.title,
        uploadedBy: user._id,
        userName: `${user.firstName} ${user.lastName}`,
      });
    }

    res.status(201).json({ success: true, data: book });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: UPDATE BOOK ──────────────────────────────────────────────
export const updateBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const book = await Book.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    getIO().emit('book_updated', { bookId: book._id, title: book.title });
    res.json({ success: true, data: book });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: DELETE BOOK ──────────────────────────────────────────────
export const deleteBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const book = await Book.findByIdAndDelete(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    getIO().emit('book_deleted', { bookId: req.params.id, title: book.title });
    res.json({ success: true, message: 'Book deleted' });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: GET ALL BOOKS ─────────────────────────────────────────────
export const listAllBooks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit = 50 } = req.query;
    const filter: any = {};
    if (status && status !== 'all') filter.approvalStatus = status;

    const books = await Book.find(filter)
      .populate('uploadedBy', 'firstName lastName email')
      .sort('-createdAt')
      .limit(Number(limit));

    const stats = {
      total: await Book.countDocuments(),
      pending: await Book.countDocuments({ approvalStatus: 'pending' }),
      approved: await Book.countDocuments({ approvalStatus: 'approved' }),
      rejected: await Book.countDocuments({ approvalStatus: 'rejected' }),
    };

    res.json({ success: true, data: { books, stats } });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: GET SINGLE BOOK ──────────────────────────────────────────
export const getBookById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const book = await Book.findById(req.params.id).populate('uploadedBy', 'firstName lastName email');
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    res.json({ success: true, data: book });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: APPROVE BOOK ─────────────────────────────────────────────
export const approveBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = req.user as IUser;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    if (book.approvalStatus === 'approved') {
      return res.status(400).json({ success: false, message: 'Book already approved' });
    }

    book.approvalStatus = 'approved';
    book.isPublished = true;
    book.adminApprovedBy = admin._id;
    book.adminApprovedAt = new Date();
    await book.save();

    // Notify the uploader
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

// ─── ADMIN: REJECT BOOK ──────────────────────────────────────────────
export const rejectBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = req.user as IUser;
    const { reason } = req.body;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    if (book.approvalStatus === 'rejected') {
      return res.status(400).json({ success: false, message: 'Book already rejected' });
    }

    book.approvalStatus = 'rejected';
    book.isPublished = false;
    book.rejectionReason = reason || 'Not specified';
    book.adminApprovedBy = admin._id;
    book.adminApprovedAt = new Date();
    await book.save();

    // Notify the uploader
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

// ─── PUBLIC: LIST PUBLISHED BOOKS (ONLY APPROVED) ────────────────────
export const listBooks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // ✅ Only fetch books that are published AND approved
    const books = await Book.find({ isPublished: true, approvalStatus: 'approved' })
      .sort('-createdAt')
      .skip(skip)
      .limit(Number(limit));

    const total = await Book.countDocuments({ isPublished: true, approvalStatus: 'approved' });

    res.json({
      success: true,
      data: books,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PUBLIC: GET SINGLE BOOK (with premium check) ────────────────────
export const getBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    // ─── PREMIUM PERMISSION CHECK ──────────────────────────────────
    // If the book is marked as premium-only, the user must be premium to view it.
    if (book.isPremium) {
      const user = req.user as IUser | undefined;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required to view this premium book' });
      }
      if (!user.isPremium && !user.roles?.includes('admin')) {
        return res.status(403).json({ success: false, message: 'Premium subscription required to view this book' });
      }
    }

    // ─── PURCHASE STATUS ──────────────────────────────────────────
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

    // Increment views
    book.views = (book.views || 0) + 1;
    await book.save();

    res.json({
      success: true,
      data: {
        ...book.toObject(),
        isPurchased,
        canDownload: book.price === 0 || isPurchased,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET PURCHASED BOOKS (User's Library) ──────────────────────────
export const getPurchasedBooks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const transactions = await Transaction.find({
      userId: user._id,
      type: 'book_purchase',
      status: 'completed',
    }).select('metadata.bookId createdAt');

    const bookIds = transactions.map(t => t.metadata?.bookId).filter(Boolean);
    const books = await Book.find({ _id: { $in: bookIds }, isPublished: true, approvalStatus: 'approved' });

    // Add purchase date to each book
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

// ─── DOWNLOAD BOOK ────────────────────────────────────────────────────
export const downloadBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    // ─── PREMIUM CHECK FOR DOWNLOAD ─────────────────────────────────
    if (book.isPremium && !user.isPremium && !user.roles?.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Premium subscription required to download this book' });
    }

    // ─── PURCHASE CHECK (unless free) ──────────────────────────────
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

    // Increment download count
    book.downloads = (book.downloads || 0) + 1;
    await book.save();

    // ─── Handle file delivery ──────────────────────────────────────
    const fileUrl = book.fileUrl;

    // If fileUrl is a Cloudinary URL, redirect to it
    if (fileUrl && fileUrl.startsWith('http')) {
      return res.redirect(fileUrl);
    }

    // If fileUrl is a local disk path
    if (fileUrl && fileUrl.startsWith('/uploads/')) {
      const diskPath = path.join(process.cwd(), fileUrl);
      if (fs.existsSync(diskPath)) {
        const fileName = `${book.title.replace(/[^a-zA-Z0-9 ]/g, ' ').trim()}.pdf`;
        return res.download(diskPath, fileName);
      }
    }

    // Fallback – if fileUrl is stored but not accessible, try to construct URL
    if (fileUrl) {
      return res.redirect(fileUrl);
    }

    return res.status(404).json({ success: false, message: 'File not found' });
  } catch (err) {
    next(err);
  }
};

// ─── PURCHASE BOOK (Initialize Paystack) ────────────────────────────
export const purchaseBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ success: false, message: 'Book ID required' });

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    if (book.price === 0) return res.status(400).json({ success: false, message: 'This book is free' });

    // Check if already purchased
    const existing = await Transaction.findOne({
      userId: user._id,
      type: 'book_purchase',
      'metadata.bookId': book._id,
      status: 'completed',
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Book already purchased' });
    }

    const metadata = {
      type: 'book_purchase',
      bookId: book._id,
      userId: user._id,
    };

    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      {
        email: user.email,
        amount: book.price * 100,
        currency: 'NGN',
        metadata,
        callback_url: `${process.env.FRONTEND_URL}/payment-callback`,
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    res.json({
      success: true,
      data: {
        paymentUrl: response.data.data.authorization_url,
        reference: response.data.data.reference,
        amount: book.price,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.response?.data?.message || err.message);
  }
};

// ─── VERIFY BOOK PURCHASE (Webhook/Manual) ──────────────────────────
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

    // Check if already purchased
    const existing = await Transaction.findOne({
      userId: user._id,
      type: 'book_purchase',
      'metadata.bookId': book._id,
      status: 'completed',
    });
    if (existing) {
      return res.json({ success: true, message: 'Book already purchased' });
    }

    // Create transaction
    await Transaction.create({
      userId: user._id,
      type: 'book_purchase',
      amount: data.amount / 100,
      status: 'completed',
      reference,
      description: `Purchase of book: ${book.title}`,
      metadata: { bookId: book._id },
    });

    // Increment downloads
    book.downloads = (book.downloads || 0) + 1;
    await book.save();

    // Notify user
    getIO().to(`user:${user._id}`).emit('book_purchased', {
      bookId: book._id,
      title: book.title,
    });

    res.json({ success: true, message: 'Book purchased successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.response?.data?.message || err.message );
  }
};

// ─── TRACK BOOK VIEW ─────────────────────────────────────────────────
export const trackBookView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await Book.findByIdAndUpdate(id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── GET BOOK STATS (Admin) ──────────────────────────────────────────
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
