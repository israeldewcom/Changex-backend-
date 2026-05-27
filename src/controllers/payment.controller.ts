import { Request, Response, NextFunction } from 'express';
import { initializeTransaction, verifyTransaction } from '../services/paystack.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import Transaction from '../models/Transaction.js';
import { IUser } from '../models/User.js';

export const payForCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.body;
    const course = await Course.findById(courseId);
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }

    const amount = course.salePrice || course.price;
    if (amount <= 0) {
      res.status(400).json({ success: false, message: 'Course is free' });
      return;
    }

    const response = await initializeTransaction(user.email, amount, {
      userId: user._id.toString(),
      courseId,
      type: 'course_purchase',
    });

    res.json({ success: true, data: response.data });
  } catch (err) {
    next(err);
  }
};

export const verifyPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference } = req.body;
    const verification = await verifyTransaction(reference);
    if (verification.data.status !== 'success') {
      res.status(400).json({ success: false, message: 'Payment not successful' });
      return;
    }

    const meta = verification.data.metadata;
    if (meta.type === 'course_purchase') {
      await Enrollment.create({ userId: meta.userId, courseId: meta.courseId });
      await Course.findByIdAndUpdate(meta.courseId, { $inc: { totalStudents: 1 } });
    }

    await Transaction.create({
      userId: meta.userId,
      type: meta.type,
      amount: verification.data.amount / 100,
      status: 'completed',
      reference,
      description: 'Paystack payment',
    });

    res.json({ success: true, message: 'Payment verified and enrollment completed' });
  } catch (err) {
    next(err);
  }
};
