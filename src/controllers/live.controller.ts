// ============================================================
// FILE: src/controllers/live.controller.ts
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import LiveSession from '../models/LiveSession.js';
import Recording from '../models/Recording.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';
import axios from 'axios';

// ─── CREATE LIVE SESSION ─────────────────────────────────────────────
export const createLiveSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { title, description, startTime, endTime, type, price, maxAttendees, academyId } = req.body;

    // Check if user can create live sessions (premium or academy owner)
    if (!user.isPremium && !user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Live sessions require Premium or academy membership' });
    }

    const session = await LiveSession.create({
      title,
      description,
      hostId: user._id,
      startTime,
      endTime,
      type: type || 'webinar',
      price: price || 0,
      maxAttendees: maxAttendees || 100,
      status: 'scheduled',
      academyId: academyId || user.academyId,
    });

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
};

// ─── GET LIVE SESSIONS ───────────────────────────────────────────────
export const getLiveSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const filter: any = {
      $or: [{ hostId: user._id }, { attendees: user._id }],
    };
    if (user.academyId) {
      filter.$or.push({ academyId: user.academyId });
    }
    const sessions = await LiveSession.find(filter).sort('-startTime');
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
};

// ─── GET SINGLE LIVE SESSION ─────────────────────────────────────────
export const getLiveSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const session = await LiveSession.findById(id).populate('hostId', 'firstName lastName avatarUrl');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    // Check access: host, attendee, or academy member
    const user = req.user as IUser;
    const isHost = session.hostId._id.toString() === user._id.toString();
    const isAttendee = session.attendees.some(a => a.toString() === user._id.toString());
    if (!isHost && !isAttendee && (!session.academyId || session.academyId.toString() !== user.academyId?.toString())) {
      return res.status(403).json({ success: false, message: 'You do not have access to this session' });
    }
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
};

// ─── JOIN LIVE SESSION ───────────────────────────────────────────────
export const joinLiveSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const session = await LiveSession.findById(id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    // Check if session is live or scheduled
    if (session.status !== 'scheduled' && session.status !== 'live') {
      return res.status(400).json({ success: false, message: 'Session is not available' });
    }

    // If price > 0, require payment (could integrate with checkout)
    if (session.price > 0) {
      // Check if already paid
      // For simplicity, we'll assume payment is handled separately
    }

    if (!session.attendees.includes(user._id)) {
      session.attendees.push(user._id);
      await session.save();
    }

    // Generate meeting URL (e.g., using Daily.co or other provider)
    const roomName = `session-${session._id}`;
    const meetingUrl = `https://daily.co/${roomName}`;

    res.json({ success: true, data: { meetingUrl, session } });
  } catch (err) {
    next(err);
  }
};

// ─── END LIVE SESSION ────────────────────────────────────────────────
export const endLiveSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const session = await LiveSession.findOne({ _id: id, hostId: user._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    session.status = 'ended';
    await session.save();

    // Notify attendees
    for (const attendeeId of session.attendees) {
      await Notification.create({
        userId: attendeeId,
        title: 'Live Session Ended',
        message: `The session "${session.title}" has ended. A recording will be available soon.`,
        type: 'system',
        data: { sessionId: session._id },
      });
    }

    res.json({ success: true, message: 'Session ended' });
  } catch (err) {
    next(err);
  }
};

// ─── GET RECORDINGS ──────────────────────────────────────────────────
export const getRecordings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const recordings = await Recording.find({ hostId: user._id }).sort('-createdAt');
    res.json({ success: true, data: recordings });
  } catch (err) {
    next(err);
  }
};
