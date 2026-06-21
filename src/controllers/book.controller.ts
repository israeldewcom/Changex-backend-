import { Request, Response } from 'express';
import Book from '../models/Book.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';

// Admin: Create book
export const createBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const { title, author, description, price, coverImage, fileUrl } = req.body;
    const book = await Book.create({
      title, author, description, price: price || 0,
      coverImage, fileUrl, uploadedBy: user._id
    });
    res.status(201).json({ success: true, data: book });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

// Admin: Update book
export const updateBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const book = await Book.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    res.json({ success: true, data: book });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

// Admin: Delete book
export const deleteBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    await Book.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Book deleted' });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

// User: List all books (public)
export const listBooks = async (req: Request, res: Response) => {
  try {
    const books = await Book.find({ isPublished: true }).sort('-createdAt');
    res.json({ success: true, data: books });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

// User: Get single book
export const getBook = async (req: Request, res: Response) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    // Increment views
    book.views += 1;
    await book.save();
    res.json({ success: true, data: book });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

// User: Download book (free or paid)
export const downloadBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

    // Check if user has purchased (if paid)
    if (book.price > 0) {
      const purchased = await Transaction.findOne({
        userId: user._id,
        type: 'book_purchase',
        'metadata.bookId': book._id,
        status: 'completed'
      });
      if (!purchased) {
        return res.status(403).json({ success: false, message: 'You need to purchase this book first' });
      }
    }

    // Increment downloads
    book.downloads += 1;
    await book.save();

    // Return the file URL (or redirect to it)
    res.json({ success: true, data: { downloadUrl: book.fileUrl } });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};

// User: Purchase a paid book (use existing Paystack flow)
export const purchaseBook = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { bookId } = req.body;
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    if (book.price === 0) return res.status(400).json({ success: false, message: 'This book is free' });

    // Reuse payment initialization – similar to course purchase
    // We'll add a new type: 'book_purchase'
    const metadata = { type: 'book_purchase', bookId: book._id, userId: user._id };
    // Call Paystack initialize endpoint (you already have that)
    // Return payment URL
    const payment = await initializePayment(user.email, book.price, metadata);
    res.json({ success: true, data: { paymentUrl: payment.authorization_url } });
  } catch (err) { res.status(500).json({ success: false, message: String(err) }); }
};
