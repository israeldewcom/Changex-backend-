// ============================================
// FILE: src/controllers/SocialController.ts (new)
// ============================================
import { Request, Response } from 'express';
import { SocialService } from '../services/SocialService';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';

export class SocialController {
  private socialService: SocialService;
  constructor() { this.socialService = SocialService.getInstance(); }

  createPost = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const userId = (req as any).user?.userId;
      const { content, media, visibility, tags } = req.body;
      const post = await this.socialService.createPost(userId, content, media || [], visibility || 'public', tags || []);
      res.status(201).json({ success: true, data: post });
    } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
  };

  getFeed = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { page = 1, limit = 20 } = req.query;
      const feed = await this.socialService.getFeed(userId, Number(page), Number(limit));
      res.json({ success: true, data: feed });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  likePost = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { postId } = req.params;
      await this.socialService.likePost(postId, userId);
      res.json({ success: true, message: 'Post liked/unliked' });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
  };

  addComment = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const userId = (req as any).user?.userId;
      const { postId } = req.params;
      const { content, parentCommentId } = req.body;
      const comment = await this.socialService.addComment(postId, userId, content, parentCommentId);
      res.status(201).json({ success: true, data: comment });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
  };

  getComments = async (req: Request, res: Response): Promise<void> => {
    try {
      const { postId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const comments = await this.socialService.getComments(postId, Number(page), Number(limit));
      res.json({ success: true, data: comments });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };
}
