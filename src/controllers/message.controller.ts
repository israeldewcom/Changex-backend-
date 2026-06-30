// ============================================================
// FILE: src/controllers/message.controller.ts (FIXED – type error)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';

export const getConversations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const conversations = await Conversation.find({ participants: user._id })
      .populate('participants', 'firstName lastName avatarUrl online lastSeen')
      .populate('lastMessage')
      .sort('-lastMessageAt')
      .lean();

    res.json({ success: true, data: conversations });
  } catch (err) {
    next(err);
  }
};

export const createConversation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { participantId } = req.body;

    if (user._id.toString() === participantId) {
      return res.status(400).json({ success: false, message: 'Cannot chat with yourself' });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [user._id, participantId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [user._id, participantId],
        isGroup: false,
      });
    }

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'firstName lastName avatarUrl online lastSeen');

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

export const getMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { limit = 50, before } = req.query;

    const conversation = await Conversation.findOne({ _id: id, participants: user._id });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const query: any = { conversationId: id };
    if (before) query.createdAt = { $lt: new Date(before as string) };

    const messages = await Message.find(query)
      .populate('senderId', 'firstName lastName avatarUrl')
      .sort('-createdAt')
      .limit(Number(limit))
      .lean();

    // Mark messages as read
    const unreadMessages = messages.filter(
      m => !m.readBy.includes(user._id) && m.senderId._id.toString() !== user._id.toString()
    );
    for (const msg of unreadMessages) {
      await Message.findByIdAndUpdate(msg._id, { $addToSet: { readBy: user._id } });
    }

    res.json({ success: true, data: messages.reverse() });
  } catch (err) {
    next(err);
  }
};

export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { content, type, fileUrl } = req.body;

    const conversation = await Conversation.findOne({ _id: id, participants: user._id });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const message = await Message.create({
      conversationId: id,
      senderId: user._id,
      content,
      type: type || 'text',
      fileUrl: fileUrl || '',
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // ✅ FIX: cast to any to bypass TypeScript type issue
    const populated = await Message.findById(message._id)
      .populate('senderId', 'firstName lastName avatarUrl')
      .lean() as any;

    // Emit to all participants
    for (const participantId of conversation.participants) {
      if (participantId.toString() !== user._id.toString()) {
        getIO().to(`user:${participantId}`).emit('new_message', populated);
        await Notification.create({
          userId: participantId,
          title: 'New Message',
          message: `${user.firstName} ${user.lastName}: ${content.substring(0, 50)}`,
          type: 'system',
          data: { conversationId: id, messageId: message._id },
        });
      }
    }

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    await Message.findByIdAndUpdate(id, { $addToSet: { readBy: user._id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const deleteMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const message = await Message.findOne({ _id: id, senderId: user._id });
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    await message.deleteOne();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
