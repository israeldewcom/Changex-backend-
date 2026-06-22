// ============================================================
// FILE: src/controllers/book.controller.ts (FULLY UPDATED WITH CLOUDINARY SIGNED URL)
// ============================================================

import { Request, Response } from 'express';
import Book from '../models/Book.js';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import axios from 'axios';
import cloudinary from '../config/cloudinary.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

// ─── Admin: Create Book ──────────────────────────────────────────────
export const createBook = async (req: Request, res: Response) => {
  console.log('📚 [createBook] 🔥 START');
  console.log('📚 [createBook] User ID:', req.user?._id);
  console.log('📚 [createBook] User Roles:', req.user?.roles);
  console.log('📚 [createBook] Headers:', req.headers.authorization ? 'Authorization present' : 'NO AUTHORIZATION');
  console.log('📚 [createBook] Raw Body:', req.body);
  console.log('📚 [createBook] File:', req.file ? '✅ File attached' : '❌ No file');

  if (req.file) {
    console.log('📚 [createBook] File details:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }

  try {
    const user = req.user as IUser;

    if (!user.roles.includes('admin')) {
      console.log('📚 [createBook] ❌ User is NOT admin');
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    console.log('📚 [createBook] ✅ User is admin');

    const { title, author, description, price, coverImage, fileUrl } = req.body;
    console.log('📚 [createBook] Extracted fields:', {
      title: title || '(empty)',
      author: author || '(empty)',
      description: description ? `${description.substring(0, 50)}...` : '(empty)',
      price: price || 0,
      coverImage: coverImage || '(empty)',
      fileUrl: fileUrl || '(empty)',
    });

    if (!title) {
      console.log('📚 [createBook] ❌ Missing title');
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    if (!author) {
      console.log('📚 [createBook] ❌ Missing author');
      return res.status(400).json({ success: false, message: 'Author is required' });
    }
    if (!fileUrl) {
      console.log('📚 [createBook] ❌ Missing fileUrl');
      return res.status(400).json({ success: false, message: 'File URL is required. Please upload a PDF first.' });
    }
    console.log('📚 [createBook] ✅ Validation passed');

    const book = await Book.create({
      title,
      author,
      description: description || '',
      price: price || 0,
      coverImage: coverImage || '',
      fileUrl,
      uploadedBy: user._id,
    });
    console.log('📚 [createBook] ✅ Book created successfully!');
    console.log('📚 [createBook] Book ID:', book._id);

    res.status(201).json({ success: true, data: book });
  } catch (err) {
    console.error('📚 [createBook] ❌ ERROR:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── Admin: Update Book ──────────────────────────────────────────────
export const updateBook = async (req: Request, res: Response) => {
  console.log('📚 [updateBook] 🔥 START');
  console.log('📚 [updateBook] User ID:', req.user?._id);
  console.log('📚 [updateBook] Book ID:', req.params.id);
  console.log('📚 [updateBook] Body:', req.body);

  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      console.log('📚 [updateBook] ❌ User is NOT admin');
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const book = await Book.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!book) {
      console.log('📚 [updateBook] ❌ Book not found');
      return res.status(404).json({ success: false, message: 'Book not found' });
    }
    console.log('📚 [updateBook] ✅ Book updated:', book._id);
    res.json({ success: true, data: book });
  } catch (err) {
    console.error('📚 [updateBook] ❌ ERROR:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── Admin: Delete Book ──────────────────────────────────────────────
export const deleteBook = async (req: Request, res: Response) => {
  console.log('📚 [deleteBook] 🔥 START');
  console.log('📚 [deleteBook] User ID:', req.user?._id);
  console.log('📚 [deleteBook] Book ID:', req.params.id);

  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      console.log('📚 [deleteBook] ❌ User is NOT admin');
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    await Book.findByIdAndDelete(req.params.id);
    console.log('📚 [deleteBook] ✅ Book deleted');
    res.json({ success: true, message: 'Book deleted' });
  } catch (err) {
    console.error('📚 [deleteBook] ❌ ERROR:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── Admin: List All Books (including unpublished) ──────────────────
export const listAllBooks = async (req: Request, res: Response) => {
  console.log('📚 [listAllBooks] 🔥 START');
  try {
    const books = await Book.find().sort('-createdAt');
    console.log(`📚 [listAllBooks] Found ${books.length} books`);
    res.json({ success: true, data: books });
  } catch (err) {
    console.error('📚 [listAllBooks] ❌ ERROR:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── User: List Published Books ──────────────────────────────────────
export const listBooks = async (req: Request, res: Response) => {
  console.log('📚 [listBooks] 🔥 START');
  try {
    const books = await Book.find({ isPublished: true }).sort('-createdAt');
    console.log(`📚 [listBooks] Found ${books.length} published books`);
    res.json({ success: true, data: books });
  } catch (err) {
    console.error('📚 [listBooks] ❌ ERROR:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── User: Get Single Book ───────────────────────────────────────────
export const getBook = async (req: Request, res: Response) => {
  console.log('📚 [getBook] 🔥 START');
  console.log('📚 [getBook] Book ID:', req.params.id);

  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      console.log('📚 [getBook] ❌ Book not found');
      return res.status(404).json({ success: false, message: 'Book not found' });
    }
    book.views += 1;
    await book.save();
    console.log('📚 [getBook] ✅ Book found, views incremented');
    res.json({ success: true, data: book });
  } catch (err) {
    console.error('📚 [getBook] ❌ ERROR:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── User: Download Book (free or paid) with Signed URL ──────────────
export const downloadBook = async (req: Request, res: Response) => {
  console.log('📚 [downloadBook] 🔥 START');
  console.log('📚 [downloadBook] Book ID:', req.params.id);
  console.log('📚 [downloadBook] User ID:', req.user?._id);

  try {
    const user = req.user as IUser;
    const book = await Book.findById(req.params.id);
    if (!book) {
      console.log('📚 [downloadBook] ❌ Book not found');
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    // ─── Check if user has purchased (if paid) ───────────────────────
    if (book.price > 0) {
      const purchased = await Transaction.findOne({
        userId: user._id,
        type: 'book_purchase',
        'metadata.bookId': book._id,
        status: 'completed',
      });
      if (!purchased) {
        console.log('📚 [downloadBook] ❌ User has not purchased this book');
        return res.status(403).json({ success: false, message: 'You need to purchase this book first' });
      }
      console.log('📚 [downloadBook] ✅ User has purchased this book');
    }

    // ─── Increment download counter ──────────────────────────────────
    book.downloads += 1;
    await book.save();
    console.log('📚 [downloadBook] ✅ Download counted:', book.downloads);

    // ─── Generate signed Cloudinary URL (if file is on Cloudinary) ───
    let signedUrl = book.fileUrl;
    if (book.fileUrl && book.fileUrl.includes('cloudinary')) {
      try {
        // Extract public ID from the URL
        const urlParts = book.fileUrl.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = filename.split('.')[0];
        const folder = urlParts.slice(urlParts.indexOf('upload') + 1, urlParts.length - 1).join('/');
        const fullPublicId = folder ? `${folder}/${publicId}` : publicId;
        
        console.log('📚 [downloadBook] Generating signed URL for publicId:', fullPublicId);
        
        // Generate signed URL with 5-minute expiry
        signedUrl = cloudinary.url(fullPublicId, {
          resource_type: 'raw',
          sign_url: true,
          expires_at: Math.floor(Date.now() / 1000) + 300, // 5 minutes
          secure: true,
        });
        console.log('📚 [downloadBook] ✅ Signed URL generated');
      } catch (cloudinaryErr) {
        console.error('📚 [downloadBook] ⚠️ Cloudinary signing failed, using original URL:', cloudinaryErr);
        // Fallback to original URL (will still work if file is public)
        signedUrl = book.fileUrl;
      }
    } else {
      console.log('📚 [downloadBook] File not on Cloudinary, using stored URL');
      signedUrl = book.fileUrl;
    }

    res.json({ success: true, data: { downloadUrl: signedUrl } });
  } catch (err) {
    console.error('📚 [downloadBook] ❌ ERROR:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── User: Purchase Book (Paystack) ──────────────────────────────────
export const purchaseBook = async (req: Request, res: Response) => {
  console.log('📚 [purchaseBook] 🔥 START');
  console.log('📚 [purchaseBook] User ID:', req.user?._id);
  console.log('📚 [purchaseBook] Body:', req.body);

  try {
    const user = req.user as IUser;
    const { bookId } = req.body;
    const book = await Book.findById(bookId);
    if (!book) {
      console.log('📚 [purchaseBook] ❌ Book not found');
      return res.status(404).json({ success: false, message: 'Book not found' });
    }
    if (book.price === 0) {
      console.log('📚 [purchaseBook] ❌ Book is free');
      return res.status(400).json({ success: false, message: 'This book is free' });
    }

    console.log('📚 [purchaseBook] 📤 Initializing Paystack payment...');
    const metadata = { type: 'book_purchase', bookId: book._id, userId: user._id };
    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      {
        email: user.email,
        amount: book.price * 100,
        currency: 'NGN',
        metadata,
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' } }
    );
    console.log('📚 [purchaseBook] ✅ Paystack payment initialized');
    res.json({
      success: true,
      data: {
        paymentUrl: response.data.data.authorization_url,
        reference: response.data.data.reference,
      },
    });
  } catch (err) {
    console.error('📚 [purchaseBook] ❌ ERROR:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};
