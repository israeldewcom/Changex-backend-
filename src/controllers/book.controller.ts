import { Request, Response } from 'express';
import Book from '../models/Book.js';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import axios from 'axios';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

// ─── Admin: Create Book (FULL DEBUG) ──────────────────────────────────
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

    // ─── Auth Check ──────────────────────────────────────────────
    console.log('📚 [createBook] 🔐 Checking admin role...');
    if (!user.roles.includes('admin')) {
      console.log('📚 [createBook] ❌ User is NOT admin');
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    console.log('📚 [createBook] ✅ User is admin');

    // ─── Extract fields ──────────────────────────────────────────
    const { title, author, description, price, coverImage, fileUrl } = req.body;
    console.log('📚 [createBook] Extracted fields:', {
      title: title || '(empty)',
      author: author || '(empty)',
      description: description ? `${description.substring(0, 50)}...` : '(empty)',
      price: price || 0,
      coverImage: coverImage || '(empty)',
      fileUrl: fileUrl || '(empty)',
    });

    // ─── Validation ──────────────────────────────────────────────
    console.log('📚 [createBook] 🔍 Validating...');
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

    // ─── Create Book ──────────────────────────────────────────────
    console.log('📚 [createBook] 💾 Saving to database...');
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
    console.log('📚 [createBook] Book Data:', JSON.stringify(book, null, 2));

    res.status(201).json({ success: true, data: book });
  } catch (err) {
    console.error('📚 [createBook] ❌ ERROR:', err);
    console.error('📚 [createBook] Error stack:', err.stack);
    res.status(500).json({ success: false, message: String(err) });
  }
};

// ─── Admin: List All Books (with count) ──────────────────────────────
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
