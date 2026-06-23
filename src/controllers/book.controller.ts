import { Request, Response } from 'express';
import Book from '../models/Book.js';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import axios from 'axios';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

// ─── Admin: Create Book ──────────────────────────────────────────────
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

// ─── Admin: Update Book ──────────────────────────────────────────────
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

// ─── Admin: Delete Book ──────────────────────────────────────────────
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

// ─── Admin: List All Books ──────────────────────────────────────────
export const listAllBooks = async (req: Request, res: Response) => {
  try {
    const books = await Book.find().sort('-createdAt');
    res.json({ success: true, data: books });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── User: List Published Books ──────────────────────────────────────
export const listBooks = async (req: Request, res: Response) => {
  try {
    const books = await Book.find({ isPublished: true }).sort('-createdAt');
    res.json({ success: true, data: books });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── User: Get Single Book – with isPurchased flag ──────────────────
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

// ─── User: Download Book – with purchase check & download count ────
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

    res.json({ success: true, data: { downloadUrl: book.fileUrl } });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── User: Purchase Book (Paystack) ──────────────────────────────────
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
