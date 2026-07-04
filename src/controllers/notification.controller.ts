// ============================================================
// FILE: src/controllers/notification.controller.ts (UPDATED)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import User, { IUser } from '../models/User.js';
import Notification from '../models/Notification.js';

// ─── Get notifications (unchanged) ───────────────────────────
export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const notifications = await Notification.find({ userId: user._id })
      .sort('-createdAt')
      .limit(100);
    res.json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
};

// ─── Mark as read (unchanged) ──────────────────────────────
export const markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── Mark all read (unchanged) ─────────────────────────────
export const markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    await Notification.updateMany({ userId: user._id, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── NEW: Register push subscription ──────────────────────────
export const registerPushSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { subscription } = req.body; // { endpoint, keys: { p256dh, auth } }

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, message: 'Invalid subscription' });
    }

    await User.findByIdAndUpdate(user._id, { pushSubscription: subscription });
    res.json({ success: true, message: 'Push subscription registered' });
  } catch (err) {
    next(err);
  }
};

// ─── NEW: Update notification preferences ──────────────────────
export const updateNotificationPreferences = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { email, sms, push } = req.body;

    const prefs = { email, sms, push };
    await User.findByIdAndUpdate(user._id, { notificationPreferences: prefs });
    res.json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
};
