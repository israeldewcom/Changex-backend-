// ============================================================
// FILE: src/controllers/cohort.controller.ts (NEW)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Cohort from '../models/Cohort.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';

export const createCohort = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId, name, startDate, endDate, capacity } = req.body;

    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found or not owner' });

    const cohort = await Cohort.create({
      courseId,
      name,
      startDate,
      endDate,
      capacity: capacity || 0,
      createdBy: user._id,
    });

    res.status(201).json({ success: true, data: cohort });
  } catch (err) {
    next(err);
  }
};

export const getCohorts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.query;

    const filter: any = {};
    if (courseId) filter.courseId = courseId;

    const cohorts = await Cohort.find(filter)
      .populate('courseId', 'title')
      .populate('createdBy', 'firstName lastName')
      .sort('-createdAt');

    res.json({ success: true, data: cohorts });
  } catch (err) {
    next(err);
  }
};

export const getCohort = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const cohort = await Cohort.findById(id)
      .populate('courseId', 'title description')
      .populate('createdBy', 'firstName lastName');
    if (!cohort) return res.status(404).json({ success: false, message: 'Cohort not found' });

    const students = await Enrollment.find({ cohortId: id })
      .populate('userId', 'firstName lastName email');

    res.json({ success: true, data: { ...cohort.toObject(), students } });
  } catch (err) {
    next(err);
  }
};

export const updateCohort = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const cohort = await Cohort.findById(id);
    if (!cohort) return res.status(404).json({ success: false, message: 'Cohort not found' });

    const course = await Course.findOne({ _id: cohort.courseId, instructorId: user._id });
    if (!course) return res.status(403).json({ success: false, message: 'Not authorized' });

    const updated = await Cohort.findByIdAndUpdate(id, req.body, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const deleteCohort = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const cohort = await Cohort.findById(id);
    if (!cohort) return res.status(404).json({ success: false, message: 'Cohort not found' });

    const course = await Course.findOne({ _id: cohort.courseId, instructorId: user._id });
    if (!course) return res.status(403).json({ success: false, message: 'Not authorized' });

    await Enrollment.updateMany({ cohortId: id }, { $unset: { cohortId: '' } });
    await cohort.deleteOne();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const addStudent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { userId } = req.body;

    const cohort = await Cohort.findById(id);
    if (!cohort) return res.status(404).json({ success: false, message: 'Cohort not found' });

    const course = await Course.findOne({ _id: cohort.courseId, instructorId: user._id });
    if (!course) return res.status(403).json({ success: false, message: 'Not authorized' });

    const enrollment = await Enrollment.findOneAndUpdate(
      { userId, courseId: cohort.courseId },
      { cohortId: id },
      { new: true, upsert: true }
    );

    res.json({ success: true, data: enrollment });
  } catch (err) {
    next(err);
  }
};

export const removeStudent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id, userId } = req.params;

    const cohort = await Cohort.findById(id);
    if (!cohort) return res.status(404).json({ success: false, message: 'Cohort not found' });

    const course = await Course.findOne({ _id: cohort.courseId, instructorId: user._id });
    if (!course) return res.status(403).json({ success: false, message: 'Not authorized' });

    await Enrollment.updateOne({ userId, courseId: cohort.courseId }, { $unset: { cohortId: '' } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
