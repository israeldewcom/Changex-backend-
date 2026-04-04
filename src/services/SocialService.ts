// ============================================
// FILE: src/services/SocialService.ts (new)
// ============================================
import { Post, Comment, User, Notification } from '../models';
import { NotificationService } from './NotificationService';
import { logger } from '../utils/logger';

export class SocialService {
  private static instance: SocialService;
  private notificationService: NotificationService;

  private constructor() { this.notificationService = NotificationService.getInstance(); }

  static getInstance(): SocialService {
    if (!SocialService.instance) SocialService.instance = new SocialService();
    return SocialService.instance;
  }

  async createPost(authorId: string, content: string, media: string[], visibility: string, tags: string[] = []): Promise<Post> {
    const post = new Post({ author: authorId, content, media, visibility, tags });
    await post.save();
    return post;
  }

  async getFeed(userId: string, page = 1, limit = 20): Promise<any> {
    const skip = (page - 1) * limit;
    const user = await User.findById(userId);
    const visibilityConditions = { visibility: 'public' };
    // For followers feed, we would need a follow system. For now, public + user's own posts.
    const posts = await Post.find({ $or: [{ visibility: 'public' }, { author: userId }], isHidden: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'firstName lastName displayName avatar');
    const total = await Post.countDocuments({ $or: [{ visibility: 'public' }, { author: userId }], isHidden: false });
    return { posts, total, page, limit };
  }

  async likePost(postId: string, userId: string): Promise<void> {
    const post = await Post.findById(postId);
    if (!post) throw new Error('Post not found');
    if (post.likes.includes(userId as any)) {
      post.likes = post.likes.filter(id => id.toString() !== userId);
      post.likesCount -= 1;
    } else {
      post.likes.push(userId as any);
      post.likesCount += 1;
      if (post.author.toString() !== userId) {
        await this.notificationService.sendNotification(post.author.toString(), 'social', {
          title: 'New Like',
          message: `${(await User.findById(userId))?.displayName} liked your post`,
          metadata: { postId: post._id, userId },
        });
      }
    }
    await post.save();
  }

  async addComment(postId: string, authorId: string, content: string, parentCommentId?: string): Promise<Comment> {
    const comment = new Comment({ post: postId, author: authorId, content, parentComment: parentCommentId });
    await comment.save();
    await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 }, $push: { comments: comment._id } });
    const post = await Post.findById(postId);
    if (post && post.author.toString() !== authorId) {
      await this.notificationService.sendNotification(post.author.toString(), 'social', {
        title: 'New Comment',
        message: `${(await User.findById(authorId))?.displayName} commented on your post`,
        metadata: { postId, commentId: comment._id },
      });
    }
    return comment;
  }

  async getComments(postId: string, page = 1, limit = 20): Promise<any> {
    const skip = (page - 1) * limit;
    const comments = await Comment.find({ post: postId, parentComment: null, isHidden: false })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'firstName lastName displayName avatar');
    const total = await Comment.countDocuments({ post: postId, parentComment: null, isHidden: false });
    return { comments, total, page, limit };
  }
}
