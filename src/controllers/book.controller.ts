// ============================================================
// FILE: src/controllers/book.controller.ts
// ============================================================

import { Request, Response } from 'express';
import Book from '../models/Book.js';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

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

    // Increment download count
    book.downloads += 1;
    await book.save();

    // ─── Hybrid download: prefer Cloudinary, fallback to disk ───
    // If the book has a Cloudinary URL in the database (or fileUrl points to Cloudinary)
    // We'll check if fileUrl contains 'cloudinary' or is a full URL.
    let downloadUrl = book.fileUrl;

    // If fileUrl is a disk path (starts with /uploads/), construct full URL
    if (downloadUrl && downloadUrl.startsWith('/uploads/')) {
      const diskPath = path.join(process.cwd(), downloadUrl);
      if (fs.existsSync(diskPath)) {
        // Serve the file from disk
        const fileName = `${book.title.replace(/[^a-zA-Z0-9 ]/g, ' ').trim()}.pdf`;
        return res.download(diskPath, fileName);
      } else {
        return res.status(404).json({ success: false, message: 'File not found on server' });
      }
    }

    // Otherwise, if it's a full URL (Cloudinary or any CDN), redirect
    if (downloadUrl && downloadUrl.startsWith('http')) {
      return res.redirect(downloadUrl);
    }

    // Fallback – if no URL, return error
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

// ============================================================
// NEW: Premium user uploads a book (pending admin approval)
// ============================================================
export const createBookByUser = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    if (!user.isPremium && !user.roles?.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Only premium users can upload books' });
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
      authorId: user._id,
      status: 'pending',
      affiliatePercent: affiliatePercent || 0,
      isPublished: false,
    });

    // Notify all admins
    const admins = await User.find({ roles: 'admin' }).select('_id');
    for (const admin of admins) {
      await Notification.create({
        userId: admin._id,
        title: '📚 New Book Pending Approval',
        message: `${user.firstName} ${user.lastName} uploaded a new book: "${title}"`,
        type: 'system',
        data: { bookId: book._id, type: 'book_approval' },
      });
    }

    res.status(201).json({ success: true, data: book });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};
