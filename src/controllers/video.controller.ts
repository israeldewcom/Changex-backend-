// ============================================================
// FILE: src/controllers/video.controller.ts (NEW)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import LiveSession from '../models/LiveSession.js';
import Meeting from '../models/Meeting.js';
import Recording from '../models/Recording.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';

// ─── CREATE LIVE SESSION ─────────────────────────────────────────────
export const createLiveSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { title, description, startTime, endTime, type, price, maxAttendees } = req.body;

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
    });

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
};

export const getLiveSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const sessions = await LiveSession.find({
      $or: [{ hostId: user._id }, { attendees: user._id }],
    }).sort('-startTime');
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
};

export const getLiveSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const session = await LiveSession.findById(id).populate('hostId', 'firstName lastName avatarUrl');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
};

export const joinLiveSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const session = await LiveSession.findById(id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    if (!session.attendees.includes(user._id)) {
      session.attendees.push(user._id);
      await session.save();
    }

    // Generate meeting URL (Daily.co)
    const roomName = `session-${session._id}`;
    const meetingUrl = `https://daily.co/${roomName}`;

    res.json({ success: true, data: { meetingUrl, session } });
  } catch (err) {
    next(err);
  }
};

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
      });
    }

    res.json({ success: true, message: 'Session ended' });
  } catch (err) {
    next(err);
  }
};

export const getRecordings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const recordings = await Recording.find({ hostId: user._id }).sort('-createdAt');
    res.json({ success: true, data: recordings });
  } catch (err) {
    next(err);
  }
};

export const createMeeting = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { title, description, startTime, duration, price } = req.body;

    const meeting = await Meeting.create({
      title,
      description,
      hostId: user._id,
      startTime,
      duration: duration || 30,
      price: price || 0,
      status: 'scheduled',
    });

    res.status(201).json({ success: true, data: meeting });
  } catch (err) {
    next(err);
  }
};

export const getMeetings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const meetings = await Meeting.find({
      $or: [{ hostId: user._id }, { attendeeId: user._id }],
    }).sort('-startTime');
    res.json({ success: true, data: meetings });
  } catch (err) {
    next(err);
  }
};

export const bookMeeting = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const meeting = await Meeting.findById(id);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    if (meeting.attendeeId) {
      return res.status(400).json({ success: false, message: 'Meeting already booked' });
    }

    if (meeting.price > 0) {
      // Return payment required
      return res.json({
        success: true,
        requirePayment: true,
        price: meeting.price,
        meetingId: meeting._id,
      });
    }

    meeting.attendeeId = user._id;
    meeting.status = 'booked';
    await meeting.save();

    await Notification.create({
      userId: meeting.hostId,
      title: 'Meeting Booked',
      message: `${user.firstName} ${user.lastName} booked a meeting with you.`,
      type: 'system',
    });

    res.json({ success: true, data: meeting });
  } catch (err) {
    next(err);
  }
};
