// ============================================================
// FILE: src/controllers/article.controller.ts
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Article from '../models/Article.js';
import ArticlePurchase from '../models/ArticlePurchase.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { generateSlug } from '../utils/slug.js';

// ─── USER: Submit article for approval (or save draft) ──────────────
export const submitArticleForApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;

    // Only premium users can create paid articles
    if (!user.isPremium && !user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Premium subscription required to create paid articles' });
    }

    const {
      title,
      content,
      excerpt,
      featuredImage,
      tags,
      isPaid,
      price,
      seoTitle,
      seoDescription,
      status, // can be 'draft' or 'pending'
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    const slug = generateSlug(title);

    // Validate price for paid articles
    if (isPaid && (!price || price < 100)) {
      return res.status(400).json({ success: false, message: 'Paid articles must have a price of at least ₦100' });
    }

    // Check for duplicate title
    const existing = await Article.findOne({ title: { $regex: new RegExp(`^${title}$`, 'i') } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An article with this title already exists' });
    }

    const articleData = {
      userId: user._id,
      title,
      slug,
      content: sanitizeHtml(content),
      excerpt: excerpt || content.substring(0, 160).replace(/<[^>]*>/g, ''),
      featuredImage: featuredImage || '',
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t: string) => t.trim())) : [],
      isPaid: isPaid || false,
      price: price || 0,
      seoTitle: seoTitle || title,
      seoDescription: seoDescription || excerpt || content.substring(0, 160).replace(/<[^>]*>/g, ''),
      status: status === 'draft' ? 'draft' : 'pending', // if not draft, submit for approval
      isPublished: false,
    };

    const article = await Article.create(articleData);

    // If submitted for approval, notify admins
    if (article.status === 'pending') {
      const admins = await User.find({ roles: 'admin' }).select('_id');
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          title: '📝 New Article Pending Approval',
          message: `${user.firstName} ${user.lastName} submitted a new article: "${article.title}" for approval.`,
          type: 'system',
          data: { articleId: article._id, type: 'article_submission' },
        });
        getIO().to(`user:${admin._id}`).emit('article_pending', {
          articleId: article._id,
          title: article.title,
          userId: user._id,
          userName: `${user.firstName} ${user.lastName}`,
        });
      }
      await Notification.create({
        userId: user._id,
        title: '📝 Article Submitted for Approval',
        message: `Your article "${article.title}" has been submitted for admin approval.`,
        type: 'system',
        data: { articleId: article._id },
      });
    }

    res.status(201).json({ success: true, data: article });
  } catch (err) {
    next(err);
  }
};

// ─── USER: Get my articles ────────────────────────────────────────────
export const getMyArticles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const articles = await Article.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .lean();

    // Add purchase count and earnings
    const articleIds = articles.map(a => a._id);
    const purchases = await ArticlePurchase.aggregate([
      { $match: { articleId: { $in: articleIds }, status: 'completed' } },
      { $group: { _id: '$articleId', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]);
    const purchaseMap = purchases.reduce((acc, p) => {
      acc[p._id.toString()] = { purchases: p.count, earnings: p.total };
      return acc;
    }, {} as Record<string, { purchases: number; earnings: number }>);

    const enriched = articles.map(a => ({
      ...a,
      purchases: purchaseMap[a._id.toString()]?.purchases || 0,
      earnings: purchaseMap[a._id.toString()]?.earnings || 0,
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: Get all articles with filter ──────────────────────────────
export const getAdminArticles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit = 50 } = req.query;
    const filter: any = {};
    if (status && status !== 'all') filter.status = status;

    const articles = await Article.find(filter)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    const stats = {
      total: await Article.countDocuments(),
      pending: await Article.countDocuments({ status: 'pending' }),
      published: await Article.countDocuments({ status: 'published' }),
      rejected: await Article.countDocuments({ status: 'rejected' }),
      drafts: await Article.countDocuments({ status: 'draft' }),
    };

    res.json({ success: true, data: { articles, stats } });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: Get article stats ──────────────────────────────────────────
export const getArticleStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const total = await Article.countDocuments();
    const published = await Article.countDocuments({ status: 'published' });
    const pending = await Article.countDocuments({ status: 'pending' });
    const totalPurchases = await ArticlePurchase.countDocuments({ status: 'completed' });
    const totalEarnings = await ArticlePurchase.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      success: true,
      data: {
        total,
        published,
        pending,
        totalPurchases,
        totalEarnings: totalEarnings[0]?.total || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: Approve article ────────────────────────────────────────────
export const approveArticle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = req.user as IUser;
    const { id } = req.params;

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    if (article.status === 'published') {
      return res.status(400).json({ success: false, message: 'Article already published' });
    }

    article.status = 'published';
    article.isPublished = true;
    article.approvedBy = admin._id;
    article.approvedAt = new Date();
    await article.save();

    // Notify author
    await Notification.create({
      userId: article.userId,
      title: '📝 Article Approved!',
      message: `Your article "${article.title}" has been approved and is now live.`,
      type: 'system',
      data: { articleId: article._id },
    });
    getIO().to(`user:${article.userId}`).emit('article_approved', {
      articleId: article._id,
      title: article.title,
    });

    res.json({ success: true, data: article });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: Reject article ─────────────────────────────────────────────
export const rejectArticle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = req.user as IUser;
    const { id } = req.params;
    const { reason } = req.body;

    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    if (article.status === 'rejected') {
      return res.status(400).json({ success: false, message: 'Article already rejected' });
    }

    article.status = 'rejected';
    article.rejectionReason = reason || 'Not specified';
    article.approvedBy = admin._id;
    article.approvedAt = new Date();
    await article.save();

    await Notification.create({
      userId: article.userId,
      title: '📝 Article Rejected',
      message: `Your article "${article.title}" was rejected. Reason: ${article.rejectionReason}`,
      type: 'system',
      data: { articleId: article._id },
    });
    getIO().to(`user:${article.userId}`).emit('article_rejected', {
      articleId: article._id,
      title: article.title,
      reason: article.rejectionReason,
    });

    res.json({ success: true, data: article });
  } catch (err) {
    next(err);
  }
};

// ─── PUBLIC: Get published articles ──────────────────────────────────
export const getPublishedArticles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const articles = await Article.find({ status: 'published', isPublished: true })
      .populate('userId', 'firstName lastName avatarUrl')
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await Article.countDocuments({ status: 'published', isPublished: true });

    res.json({
      success: true,
      data: articles,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PUBLIC: Get article by slug ──────────────────────────────────────
export const getArticleBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const article = await Article.findOne({ slug, status: 'published', isPublished: true })
      .populate('userId', 'firstName lastName avatarUrl bio')
      .lean();

    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    // Increment views
    await Article.findByIdAndUpdate(article._id, { $inc: { views: 1 } });

    // Check if user has purchased
    let hasPurchased = false;
    if (req.user) {
      const user = req.user as IUser;
      const purchase = await ArticlePurchase.findOne({ userId: user._id, articleId: article._id, status: 'completed' });
      hasPurchased = !!purchase;
    }

    // If paid and not purchased, only return preview
    let content = article.content;
    let previewContent = article.previewContent || '';
    if (article.isPaid && !hasPurchased && !(req.user && (req.user as IUser)._id.toString() === article.userId.toString())) {
      content = previewContent || article.content.substring(0, 300);
    }

    res.json({
      success: true,
      data: {
        ...article,
        content,
        hasPurchased,
        isOwner: req.user && (req.user as IUser)._id.toString() === article.userId.toString(),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── USER: Purchase article (initiate payment) ──────────────────────
export const purchaseArticle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const article = await Article.findById(id);
    if (!article || !article.isPublished) {
      return res.status(404).json({ success: false, message: 'Article not available' });
    }
    if (!article.isPaid || article.price === 0) {
      return res.status(400).json({ success: false, message: 'This article is free' });
    }

    const existing = await ArticlePurchase.findOne({ userId: user._id, articleId: article._id, status: 'completed' });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already purchased' });
    }

    // Create a pending purchase record
    const purchase = await ArticlePurchase.create({
      userId: user._id,
      articleId: article._id,
      amount: article.price,
      status: 'pending',
    });

    // The actual payment will be handled by the payment controller, which will call verifyArticlePurchase
    res.json({
      success: true,
      data: {
        purchase,
        paymentRequired: true,
        amount: article.price,
        articleId: article._id,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Verify article purchase (called from payment webhook/controller) ──
export const verifyArticlePurchase = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { reference, articleId } = req.body;

    // This function is called after successful payment verification.
    // We find the purchase by reference or by articleId and update status.
    const purchase = await ArticlePurchase.findOne({ userId: user._id, articleId, status: 'pending' });
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase record not found' });
    }

    purchase.status = 'completed';
    purchase.completedAt = new Date();
    await purchase.save();

    // Add transaction
    await Transaction.create({
      userId: user._id,
      type: 'article_purchase',
      amount: purchase.amount,
      status: 'completed',
      description: `Purchase of article: ${articleId}`,
      reference,
      metadata: { articleId },
    });

    // Notify author
    const article = await Article.findById(articleId);
    if (article) {
      await Notification.create({
        userId: article.userId,
        title: '📰 Article Purchased',
        message: `Your article "${article.title}" was purchased by ${user.firstName} ${user.lastName}.`,
        type: 'system',
        data: { articleId, purchaserId: user._id },
      });
      getIO().to(`user:${article.userId}`).emit('article_purchased', {
        articleId,
        title: article.title,
        purchaser: `${user.firstName} ${user.lastName}`,
      });
    }

    res.json({ success: true, message: 'Article purchase verified' });
  } catch (err) {
    next(err);
  }
};

// ─── Track article view ─────────────────────────────────────────────
export const trackArticleView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await Article.findByIdAndUpdate(id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── Get article by ID (for editing) ──────────────────────────────
export const getArticleById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const article = await Article.findOne({ _id: id, userId: user._id });
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found or not yours' });
    }
    res.json({ success: true, data: article });
  } catch (err) {
    next(err);
  }
};

// ─── Update article (draft or pending) ──────────────────────────────
export const updateArticle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const updateData = req.body;

    const article = await Article.findOne({ _id: id, userId: user._id });
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found or not yours' });
    }

    // Only allow updates if article is draft or pending (not published)
    if (article.status === 'published') {
      return res.status(403).json({ success: false, message: 'Cannot edit a published article' });
    }

    // Sanitize content if provided
    if (updateData.content) {
      updateData.content = sanitizeHtml(updateData.content);
    }

    // Update fields
    Object.assign(article, updateData);
    if (updateData.title) {
      article.slug = generateSlug(updateData.title);
    }
    await article.save();

    res.json({ success: true, data: article });
  } catch (err) {
    next(err);
  }
};

// ─── Delete article (draft only) ─────────────────────────────────────
export const deleteArticle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const article = await Article.findOne({ _id: id, userId: user._id });
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found or not yours' });
    }

    if (article.status === 'published') {
      return res.status(403).json({ success: false, message: 'Cannot delete a published article' });
    }

    await article.deleteOne();
    res.json({ success: true, message: 'Article deleted' });
  } catch (err) {
    next(err);
  }
};
