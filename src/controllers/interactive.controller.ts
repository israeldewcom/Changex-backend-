import { Request, Response, NextFunction } from 'express';
import InteractiveMaterial from '../models/InteractiveMaterial.js';
import Lesson from '../models/Lesson.js';
import Course from '../models/Course.js';
import { IUser } from '../models/User.js';

export const addInteractiveMaterial = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { lessonId } = req.params;
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    
    const course = await Course.findById(lesson.courseId);
    if (!course || course.instructorId.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    const material = await InteractiveMaterial.create({ ...req.body, lessonId });
    res.status(201).json({ success: true, data: material });
  } catch (err) { next(err); }
};

export const getLessonMaterials = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lessonId } = req.params;
    const materials = await InteractiveMaterial.find({ lessonId }).sort('order');
    res.json({ success: true, data: materials });
  } catch (err) { next(err); }
};

export const updateMaterial = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const material = await InteractiveMaterial.findById(id);
    if (!material) return res.status(404).json({ success: false, message: 'Material not found' });
    
    const lesson = await Lesson.findById(material.lessonId);
    const course = await Course.findById(lesson?.courseId);
    if (!course || course.instructorId.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    const updated = await InteractiveMaterial.findByIdAndUpdate(id, req.body, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

export const deleteMaterial = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const material = await InteractiveMaterial.findById(id);
    if (!material) return res.status(404).json({ success: false, message: 'Material not found' });
    
    const lesson = await Lesson.findById(material.lessonId);
    const course = await Course.findById(lesson?.courseId);
    if (!course || course.instructorId.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    await InteractiveMaterial.findByIdAndDelete(id);
    res.json({ success: true, message: 'Material deleted' });
  } catch (err) { next(err); }
};

export const reorderMaterials = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lessonId } = req.params;
    const { orderIds } = req.body; // array of material IDs in new order
    
    for (let i = 0; i < orderIds.length; i++) {
      await InteractiveMaterial.findByIdAndUpdate(orderIds[i], { order: i });
    }
    res.json({ success: true, message: 'Materials reordered' });
  } catch (err) { next(err); }
};
