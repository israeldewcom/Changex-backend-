// ============================================================
// FILE: src/controllers/post.controller.ts (UPDATED – added paywall + paid article support)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';
import Notification from '../models/Notification.js';
import Follow from '../models/Follow.js';
import Course from '../models/Course.js';
import PostAnalytics from '../models/PostAnalytics.js';
import ArticlePurchase from '../models/ArticlePurchase.js';
import Transaction from '../models/Transaction.js';
import { IUser } from '../models/User.js';
import { getIO } from '../socket.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { getOrSetCache, invalidateCache } from '../services/cache.js';

function generateSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
}

export const createPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { title, content, excerpt, type, tags, featuredImage, seoTitle, seoDescription, seoKeywords, courseId, isPublished, isPaid, price, previewContent } = req.body;

    const slug = generateSlug(title);
    const post = await Post.create({
      title,
      slug,
      content,
      excerpt: excerpt || content.substring(0, 160).replace(/<[^>]*>/g, ''),
      type: type || 'article',
      authorId: user._id,
      courseId,
      featuredImage,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t: string) => t.trim())) : [],
      seoTitle: seoTitle || title,
      seoDescription: seoDescription || excerpt || content.substring(0, 160).replace(/<[^>]*>/g, ''),
      seoKeywords: seoKeywords || tags,
      isPublished: true,
      isPaid: isPaid || false,
      price: price || 0,
      previewContent: previewContent || content.substring(0, 200),
    });

    await invalidateCache('posts:*');

    const populatedPost = await Post.findById(post._id).populate('authorId', 'firstName lastName avatarUrl');
    getIO().emit('new_post', populatedPost);

    res.status(201).json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

export const updatePost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const post = await Post.findOne({ _id: id, authorId: user._id });
    if (!post && !(req.user as IUser).roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const updated = await Post.findByIdAndUpdate(id, req.body, { new: true });
    await invalidateCache(`post:${id}`);
    await invalidateCache('posts:*');
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const publishPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const post = await Post.findOne({ _id: id, authorId: user._id });
    if (!post && !(req.user as IUser).roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    post.isPublished = true;
    post.publishedAt = new Date();
    await post.save();

    const followers = await Follow.find({ followingId: user._id });
    await Notification.insertMany(followers.map(f => ({
      userId: f.followerId,
      title: 'New Post from ' + user.firstName,
      message: post.title,
      type: 'system',
      data: { postId: post._id, slug: post.slug }
    })));

    const populatedPost = await Post.findById(post._id).populate('authorId', 'firstName lastName avatarUrl');
    getIO().emit('new_post', populatedPost);

    await invalidateCache('posts:*');
    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

export const deletePost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const post = await Post.findOne({ _id: id, authorId: user._id });
    if (!post && !(req.user as IUser).roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    await Comment.deleteMany({ postId: id });
    await Like.deleteMany({ targetId: id, targetType: 'post' });
    await PostAnalytics.deleteOne({ postId: id });
    await Post.findByIdAndDelete(id);
    await invalidateCache(`post:${id}`);
    await invalidateCache('posts:*');
    getIO().emit('post_deleted', { postId: id });
    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    next(err);
  }
};

export const uploadPostVideo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const post = await Post.findOne({ _id: id, authorId: user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No video file uploaded' });
    const result = await uploadToCloudinary(req.file.buffer, `posts/${id}/videos`, { resource_type: 'video' });
    post.videoUrl = result.secure_url;
    await post.save();
    await invalidateCache(`post:${id}`);
    res.json({ success: true, data: { videoUrl: result.secure_url } });
  } catch (err) {
    next(err);
  }
};

export const getPublishedPosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10, tag, type, author } = req.query;
    const filter: any = { isPublished: true };
    if (tag) filter.tags = tag;
    if (type) filter.type = type;
    if (author) filter.authorId = author;

    const cacheKey = `posts:${JSON.stringify({ page, limit, tag, type, author })}`;
    const data = await getOrSetCache(cacheKey, async () => {
      const posts = await Post.find(filter)
        .populate('authorId', 'firstName lastName avatarUrl bio')
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean();

      const postIds = posts.map(p => p._id);
      const analytics = await PostAnalytics.find({ postId: { $in: postIds } });
      const earningsMap = analytics.reduce((acc, a) => { acc[a.postId.toString()] = a.earnings; return acc; }, {} as Record<string, number>);

      const postsWithEarnings = posts.map(p => ({
        ...p,
        earnings: earningsMap[p._id.toString()] || 0
      }));

      const total = await Post.countDocuments(filter);
      return { posts: postsWithEarnings, total };
    }, 3600);

    res.json({
      success: true,
      data: {
        posts: data.posts,
        pagination: {
          total: data.total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(data.total / Number(limit))
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET POST BY SLUG (with paywall check) ──────────────────────────
export const getPostBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const cacheKey = `post:${slug}`;
    const post = await getOrSetCache(cacheKey, async () => {
      const found = await Post.findOneAndUpdate(
        { slug, isPublished: true },
        { $inc: { views: 1 } },
        { new: true }
      ).populate('authorId', 'firstName lastName avatarUrl bio socialLinks').lean();
      if (!found) return null;
      const analytics = await PostAnalytics.findOne({ postId: found._id });
      return { ...found, earnings: analytics?.earnings || 0 };
    }, 3600);

    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    let userLiked = false;
    let hasPurchased = false;
    let previewContent = post.previewContent || '';

    if (req.user) {
      const user = req.user as IUser;
      const like = await Like.findOne({ userId: user._id, targetId: post._id, targetType: 'post' });
      userLiked = !!like;

      if (post.isPaid) {
        const purchase = await ArticlePurchase.findOne({ userId: user._id, postId: post._id, status: 'completed' });
        hasPurchased = !!purchase;
      }
    }

    const isOwner = req.user && (req.user as IUser)._id.toString() === post.authorId._id.toString();

    // If paid and not purchased and not owner, only return preview
    let content = post.content;
    if (post.isPaid && !hasPurchased && !isOwner) {
      content = previewContent || post.content.substring(0, 300);
    }

    res.json({
      success: true,
      data: {
        ...post,
        content,
        isPaid: post.isPaid,
        hasPurchased,
        isOwner,
        previewContent,
        userLiked,
        fullContent: post.content, // Full content (for owner/purchaser)
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── PURCHASE ARTICLE ───────────────────────────────────────────────
export const purchaseArticle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { postId } = req.body;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (!post.isPaid) return res.status(400).json({ success: false, message: 'This article is free' });

    const existing = await ArticlePurchase.findOne({ userId: user._id, postId: post._id, status: 'completed' });
    if (existing) return res.status(400).json({ success: false, message: 'Already purchased' });

    // Create purchase record (payment handled via Paystack flow)
    // Payment verification will complete the purchase
    const purchase = await ArticlePurchase.create({
      userId: user._id,
      postId: post._id,
      amount: post.price,
      status: 'pending',
    });

    res.json({
      success: true,
      data: {
        purchase,
        paymentRequired: true,
        amount: post.price,
        postId: post._id,
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET PURCHASED ARTICLES ─────────────────────────────────────────
export const getPurchasedArticles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const purchases = await ArticlePurchase.find({ userId: user._id, status: 'completed' })
      .populate('postId', 'title slug featuredImage excerpt')
      .sort('-createdAt');
    res.json({ success: true, data: purchases });
  } catch (err) {
    next(err);
  }
};

// ─── GET POST PREVIEW ────────────────────────────────────────────────
export const getPostPreview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const post = await Post.findById(id).select('title previewContent excerpt featuredImage slug isPaid price');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

// ─── LIKE POST ─────────────────────────────────────────────────────
export const likePost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const existing = await Like.findOne({ userId: user._id, targetId: id, targetType: 'post' });
    if (existing) {
      await existing.deleteOne();
      await Post.findByIdAndUpdate(id, { $inc: { likes: -1 } });
      await PostAnalytics.findOneAndUpdate(
        { postId: id },
        { $inc: { likes: -1, totalEngagement: -1 } },
        { upsert: true }
      );
      await invalidateCache(`post:${id}`);
      res.json({ success: true, liked: false, likes: (await Post.findById(id))?.likes });
    } else {
      await Like.create({ userId: user._id, targetId: id, targetType: 'post' });
      const post = await Post.findByIdAndUpdate(id, { $inc: { likes: 1 } }, { new: true });
      await PostAnalytics.findOneAndUpdate(
        { postId: id },
        { $inc: { likes: 1, totalEngagement: 1 } },
        { upsert: true }
      );
      await invalidateCache(`post:${id}`);
      res.json({ success: true, liked: true, likes: post?.likes });
    }
  } catch (err) {
    next(err);
  }
};

export const addComment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { content, parentId } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, message: 'Comment content is required' });
    }

    const comment = await Comment.create({
      postId: id,
      userId: user._id,
      content,
      parentId: parentId || null,
    });

    await Post.findByIdAndUpdate(id, { $inc: { commentsCount: 1 } });
    await PostAnalytics.findOneAndUpdate(
      { postId: id },
      { $inc: { comments: 1, totalEngagement: 2 } },
      { upsert: true }
    );

    // Notify post author
    const post = await Post.findById(id);
    if (post && post.authorId.toString() !== user._id.toString()) {
      await Notification.create({
        userId: post.authorId,
        title: 'New Comment',
        message: `${user.firstName} commented on your post: ${content.substring(0, 100)}`,
        type: 'system',
        data: { postId: id, commentId: comment._id }
      });
      getIO().to(`user:${post.authorId}`).emit('notification', { title: 'New Comment' });
    }

    // If reply, notify parent comment author
    if (parentId) {
      const parentComment = await Comment.findById(parentId).populate('userId', '_id');
      if (parentComment && parentComment.userId && parentComment.userId.toString() !== user._id.toString()) {
        await Notification.create({
          userId: parentComment.userId,
          title: 'Reply to your comment',
          message: `${user.firstName} replied to your comment: ${content.substring(0, 100)}`,
          type: 'system',
          data: { postId: id, commentId: comment._id }
        });
        getIO().to(`user:${parentComment.userId}`).emit('notification', { title: 'Reply to comment' });
      }
    }

    await invalidateCache(`post:${id}`);
    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    next(err);
  }
};

export const getComments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const comments = await Comment.find({ postId: id, parentId: null })
      .populate('userId', 'firstName lastName avatarUrl')
      .sort('createdAt');

    const commentsWithReplies = await Promise.all(comments.map(async (comment) => {
      const replies = await Comment.find({ parentId: comment._id })
        .populate('userId', 'firstName lastName avatarUrl')
        .sort('createdAt');
      return { ...comment.toObject(), replies };
    }));

    res.json({ success: true, data: commentsWithReplies });
  } catch (err) {
    next(err);
  }
};

export const likeComment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const existing = await Like.findOne({ userId: user._id, targetId: id, targetType: 'comment' });
    if (existing) {
      await existing.deleteOne();
      await Comment.findByIdAndUpdate(id, { $inc: { likes: -1 } });
      res.json({ success: true, liked: false });
    } else {
      await Like.create({ userId: user._id, targetId: id, targetType: 'comment' });
      await Comment.findByIdAndUpdate(id, { $inc: { likes: 1 } });
      res.json({ success: true, liked: true });
    }
  } catch (err) {
    next(err);
  }
};

export const sharePost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await Post.findByIdAndUpdate(id, { $inc: { shares: 1 } });
    await PostAnalytics.findOneAndUpdate(
      { postId: id },
      { $inc: { shares: 1, totalEngagement: 3 } },
      { upsert: true }
    );
    await invalidateCache(`post:${id}`);
    res.json({ success: true, message: 'Share counted' });
  } catch (err) {
    next(err);
  }
};

export const getUserPosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const posts = await Post.find({ authorId: userId, isPublished: true })
      .populate('authorId', 'firstName lastName avatarUrl')
      .sort({ createdAt: -1 })
      .lean();
    const postIds = posts.map(p => p._id);
    const analytics = await PostAnalytics.find({ postId: { $in: postIds } });
    const earningsMap = analytics.reduce((acc, a) => { acc[a.postId.toString()] = a.earnings; return acc; }, {} as Record<string, number>);
    const postsWithEarnings = posts.map(p => ({ ...p, earnings: earningsMap[p._id.toString()] || 0 }));
    res.json({ success: true, data: postsWithEarnings });
  } catch (err) {
    next(err);
  }
};

export const getFollowingFeed = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const follows = await Follow.find({ followerId: user._id }).select('followingId');
    const followedIds = follows.map(f => f.followingId);

    if (followedIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const posts = await Post.find({
      authorId: { $in: followedIds },
      isPublished: true
    })
      .populate('authorId', 'firstName lastName avatarUrl')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const courses = await Course.find({
      instructorId: { $in: followedIds },
      isPublished: true,
      approvalStatus: 'approved'
    })
      .populate('instructorId', 'firstName lastName avatarUrl')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const postIds = posts.map(p => p._id);
    const analytics = await PostAnalytics.find({ postId: { $in: postIds } });
    const earningsMap = analytics.reduce((acc, a) => { acc[a.postId.toString()] = a.earnings; return acc; }, {} as Record<string, number>);
    const postsWithEarnings = posts.map(p => ({ ...p, earnings: earningsMap[p._id.toString()] || 0 }));

    const feed = [
      ...postsWithEarnings.map(p => ({
        ...p,
        type: 'post',
        date: p.publishedAt || p.createdAt,
        author: p.authorId,
      })),
      ...courses.map(c => ({
        ...c,
        type: 'course',
        date: c.createdAt,
        author: c.instructorId,
      }))
    ];

    feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ success: true, data: feed });
  } catch (err) {
    next(err);
  }
};

export const trackPostView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await Post.findByIdAndUpdate(id, { $inc: { views: 1 } });
    await PostAnalytics.findOneAndUpdate(
      { postId: id },
      { $inc: { views: 1, totalEngagement: 0.5 } },
      { upsert: true }
    );
    await invalidateCache(`post:${id}`);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const getPostAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const analytics = await PostAnalytics.findOne({ postId: id }).populate('postId', 'title authorId');
    if (!analytics) {
      return res.json({ success: true, data: { views: 0, likes: 0, comments: 0, shares: 0, totalEngagement: 0, earnings: 0 } });
    }
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
};

export const getMySocialEarnings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const posts = await Post.find({ authorId: user._id, isPublished: true }).select('_id');
    const postIds = posts.map(p => p._id);
    const analytics = await PostAnalytics.find({ postId: { $in: postIds } });
    const totalEarnings = analytics.reduce((sum, a) => sum + (a.earnings || 0), 0);
    res.json({ success: true, data: { totalEarnings, posts: analytics } });
  } catch (err) {
    next(err);
  }
};

export const getMyPostTitles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const posts = await Post.find({ authorId: user._id }).select('title').lean();
    const titles = posts.map(p => p.title);
    res.json({ success: true, data: titles });
  } catch (err) {
    next(err);
  }
};

export const getPersonalizedFeed = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { page = 1, limit = 10 } = req.query;

    const likes = await Like.find({ userId: user._id, targetType: 'post' }).populate('targetId');
    const likedPostIds = likes.map(l => l.targetId);
    const likedPosts = await Post.find({ _id: { $in: likedPostIds } });
    const userTags = likedPosts.flatMap(p => p.tags || []);
    const tagFrequency: Record<string, number> = {};
    userTags.forEach(tag => { tagFrequency[tag] = (tagFrequency[tag] || 0) + 1; });
    const topTags = Object.entries(tagFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    const filter: any = { isPublished: true };
    const posts = await Post.find(filter)
      .populate('authorId', 'firstName lastName avatarUrl bio')
      .sort({ createdAt: -1 })
      .lean();

    const follows = await Follow.find({ followerId: user._id }).select('followingId');
    const followedIds = follows.map(f => f.followingId.toString());

    const scored = posts.map(post => {
      let score = 0;
      const authorId = (post.authorId as any)?._id?.toString();
      if (authorId && followedIds.includes(authorId)) {
        score += 0.2;
      }
      const postTags = post.tags || [];
      const tagOverlap = postTags.filter(t => topTags.includes(t)).length;
      score += (tagOverlap / (topTags.length || 1)) * 0.3;
      const daysAgo = (Date.now() - new Date(post.publishedAt || post.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      const recency = Math.max(0, 1 - daysAgo / 30);
      score += recency * 0.2;
      const engagement = (post.likes || 0) + (post.commentsCount || 0) + (post.shares || 0);
      const maxEngagement = 1000;
      score += Math.min(1, engagement / maxEngagement) * 0.3;
      return { ...post, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const start = (Number(page) - 1) * Number(limit);
    const end = start + Number(limit);
    const paginated = scored.slice(start, end);

    const postIds = paginated.map(p => p._id);
    const analytics = await PostAnalytics.find({ postId: { $in: postIds } });
    const earningsMap = analytics.reduce((acc, a) => { acc[a.postId.toString()] = a.earnings; return acc; }, {} as Record<string, number>);

    const result = paginated.map(p => ({
      ...p,
      earnings: earningsMap[p._id.toString()] || 0
    }));

    const total = await Post.countDocuments(filter);
    res.json({
      success: true,
      data: {
        posts: result,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (err) {
    next(err);
  }
};
