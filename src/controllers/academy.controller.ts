// ============================================================
// FILE: src/controllers/academy.controller.ts
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Academy from '../models/Academy.js';
import AcademyMembership from '../models/AcademyMembership.js';
import AcademyBranding from '../models/AcademyBranding.js';
import AcademyDomain from '../models/AcademyDomain.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';
import { generateSlug } from '../utils/slug.js';
import { uploadToCloudinary } from '../services/cloudinary.js';

// ─── CREATE ACADEMY ────────────────────────────────────────────────────
export const createAcademy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { name, description, isPublic, allowPublicEnrollment, requireApproval, subscriptionTier } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Academy name is required' });
    }

    // Check max academies per user
    const existingCount = await Academy.countDocuments({ ownerId: user._id });
    const maxAllowed = parseInt(process.env.MAX_ACADEMIES_PER_USER || '5');
    if (existingCount >= maxAllowed) {
      return res.status(400).json({ success: false, message: `You can create up to ${maxAllowed} academies` });
    }

    const slug = generateSlug(name) + '-' + Date.now().toString(36);

    const academy = await Academy.create({
      name,
      slug,
      description: description || '',
      ownerId: user._id,
      isPublic: isPublic !== undefined ? isPublic : true,
      allowPublicEnrollment: allowPublicEnrollment !== undefined ? allowPublicEnrollment : true,
      requireApproval: requireApproval !== undefined ? requireApproval : false,
      subscriptionTier: subscriptionTier || 'free',
      settings: {
        theme: {
          primaryColor: '#D4AF37',
          secondaryColor: '#FBBF24',
          accentColor: '#B8860B',
          backgroundColor: '#FDF8F0',
          textColor: '#2C2418',
          fontFamily: 'Inter, sans-serif',
          borderRadius: '20px',
          buttonStyle: 'rounded',
          cardStyle: 'glass',
          navigationStyle: 'modern',
          darkMode: false,
        },
      },
    });

    // Add owner as academy member with owner role
    await AcademyMembership.create({
      academyId: academy._id,
      userId: user._id,
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
    });

    // Update user with academyId
    user.academyId = academy._id;
    user.academyRole = 'owner';
    await user.save();

    // Create default branding
    await AcademyBranding.create({
      academyId: academy._id,
      theme: academy.settings.theme,
    });

    res.status(201).json({
      success: true,
      data: academy,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET ACADEMY ──────────────────────────────────────────────────────
export const getAcademy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const academy = await Academy.findById(id);
    if (!academy) {
      return res.status(404).json({ success: false, message: 'Academy not found' });
    }
    // Check if user has access (public or member)
    const user = req.user as IUser;
    let membership = null;
    if (user) {
      membership = await AcademyMembership.findOne({ academyId: academy._id, userId: user._id });
    }
    if (!academy.isPublic && !membership) {
      return res.status(403).json({ success: false, message: 'This academy is private' });
    }
    const branding = await AcademyBranding.findOne({ academyId: academy._id });
    const domains = await AcademyDomain.find({ academyId: academy._id });
    res.json({
      success: true,
      data: {
        ...academy.toObject(),
        branding,
        domains,
        isMember: !!membership,
        membershipRole: membership?.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE ACADEMY ──────────────────────────────────────────────────
export const updateAcademy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const membership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'You do not have permission to update this academy' });
    }
    const { name, description, isPublic, allowPublicEnrollment, requireApproval, settings } = req.body;
    const updateData: any = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    if (allowPublicEnrollment !== undefined) updateData.allowPublicEnrollment = allowPublicEnrollment;
    if (requireApproval !== undefined) updateData.requireApproval = requireApproval;
    if (settings) {
      updateData.settings = settings;
    }
    const academy = await Academy.findByIdAndUpdate(id, updateData, { new: true });
    if (!academy) {
      return res.status(404).json({ success: false, message: 'Academy not found' });
    }
    res.json({ success: true, data: academy });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE ACADEMY ──────────────────────────────────────────────────
export const deleteAcademy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const membership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only the academy owner can delete it' });
    }
    // Delete all related data
    await AcademyMembership.deleteMany({ academyId: id });
    await AcademyBranding.deleteOne({ academyId: id });
    await AcademyDomain.deleteMany({ academyId: id });
    await Course.deleteMany({ academyId: id });
    await Enrollment.deleteMany({ academyId: id });
    await Transaction.deleteMany({ academyId: id });
    await Notification.deleteMany({ academyId: id });
    await Academy.findByIdAndDelete(id);
    // Remove academyId from users
    await User.updateMany({ academyId: id }, { $unset: { academyId: '', academyRole: '' } });
    res.json({ success: true, message: 'Academy deleted' });
  } catch (err) {
    next(err);
  }
};

// ─── GET ACADEMY MEMBERS ─────────────────────────────────────────────
export const getAcademyMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const membership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this academy' });
    }
    const members = await AcademyMembership.find({ academyId: id })
      .populate('userId', 'firstName lastName email avatarUrl')
      .sort('-joinedAt');
    res.json({ success: true, data: members });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE MEMBERSHIP ROLE ──────────────────────────────────────────
export const updateMembershipRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, membershipId } = req.params;
    const { role, status } = req.body;
    const user = req.user as IUser;
    const adminMembership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!adminMembership || (adminMembership.role !== 'owner' && adminMembership.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    const target = await AcademyMembership.findById(membershipId);
    if (!target || target.academyId.toString() !== id) {
      return res.status(404).json({ success: false, message: 'Membership not found' });
    }
    // Prevent demoting/removing owner
    if (target.role === 'owner') {
      return res.status(400).json({ success: false, message: 'Cannot modify the academy owner' });
    }
    if (role) target.role = role;
    if (status) target.status = status;
    await target.save();
    res.json({ success: true, data: target });
  } catch (err) {
    next(err);
  }
};

// ─── REMOVE MEMBER ────────────────────────────────────────────────────
export const removeMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, membershipId } = req.params;
    const user = req.user as IUser;
    const adminMembership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!adminMembership || (adminMembership.role !== 'owner' && adminMembership.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    const target = await AcademyMembership.findById(membershipId);
    if (!target || target.academyId.toString() !== id) {
      return res.status(404).json({ success: false, message: 'Membership not found' });
    }
    if (target.role === 'owner') {
      return res.status(400).json({ success: false, message: 'Cannot remove the academy owner' });
    }
    await target.deleteOne();
    // If user has academyId set, unset it
    const memberUser = await User.findById(target.userId);
    if (memberUser && memberUser.academyId?.toString() === id) {
      memberUser.academyId = undefined;
      memberUser.academyRole = undefined;
      await memberUser.save();
    }
    res.json({ success: true, message: 'Member removed' });
  } catch (err) {
    next(err);
  }
};

// ─── APPLY TO ACADEMY ────────────────────────────────────────────────
export const applyToAcademy = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const academy = await Academy.findById(id);
    if (!academy) {
      return res.status(404).json({ success: false, message: 'Academy not found' });
    }
    const existing = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You are already a member or have a pending application' });
    }
    const membership = await AcademyMembership.create({
      academyId: id,
      userId: user._id,
      role: 'student',
      status: academy.requireApproval ? 'pending' : 'active',
      joinedAt: new Date(),
      applicationData: req.body.applicationData || {},
    });
    // Notify academy admins
    const admins = await AcademyMembership.find({ academyId: id, role: { $in: ['owner', 'admin'] } });
    for (const admin of admins) {
      await Notification.create({
        userId: admin.userId,
        title: 'New Academy Application',
        message: `${user.firstName} ${user.lastName} applied to join "${academy.name}"`,
        type: 'academy',
        data: { academyId: id, membershipId: membership._id },
        academyId: id,
      });
    }
    res.json({
      success: true,
      message: academy.requireApproval ? 'Application submitted for review' : 'You have joined the academy',
      data: membership,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET ACADEMY COURSES ─────────────────────────────────────────────
export const getAcademyCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const membership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!membership) {
      const academy = await Academy.findById(id);
      if (!academy || !academy.isPublic) {
        return res.status(403).json({ success: false, message: 'This academy is private' });
      }
    }
    const courses = await Course.find({ academyId: id, isPublished: true, approvalStatus: 'approved' })
      .populate('instructorId', 'firstName lastName')
      .sort('-createdAt');
    res.json({ success: true, data: courses });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE ACADEMY BRANDING ─────────────────────────────────────────
export const updateAcademyBranding = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const membership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    const { theme, logo, favicon, customCSS, customJS, headerScripts, footerScripts } = req.body;
    const branding = await AcademyBranding.findOne({ academyId: id });
    if (!branding) {
      return res.status(404).json({ success: false, message: 'Branding not found' });
    }
    if (theme) branding.theme = { ...branding.theme, ...theme };
    if (logo !== undefined) branding.logo = logo;
    if (favicon !== undefined) branding.favicon = favicon;
    if (customCSS !== undefined) branding.customCSS = customCSS;
    if (customJS !== undefined) branding.customJS = customJS;
    if (headerScripts !== undefined) branding.headerScripts = headerScripts;
    if (footerScripts !== undefined) branding.footerScripts = footerScripts;
    await branding.save();
    // Also update academy settings for quick access
    await Academy.findByIdAndUpdate(id, {
      'settings.theme': branding.theme,
    });
    res.json({ success: true, data: branding });
  } catch (err) {
    next(err);
  }
};

// ─── ADD CUSTOM DOMAIN ──────────────────────────────────────────────
export const addCustomDomain = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { domain } = req.body;
    const user = req.user as IUser;
    const membership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only the owner can add custom domains' });
    }
    // Check domain uniqueness
    const existing = await AcademyDomain.findOne({ domain });
    if (existing) {
      return res.status(400).json({ success: false, message: 'This domain is already in use' });
    }
    const domainDoc = await AcademyDomain.create({
      academyId: id,
      domain,
      verified: false,
      verificationToken: Math.random().toString(36).substring(2, 15),
    });
    res.status(201).json({ success: true, data: domainDoc });
  } catch (err) {
    next(err);
  }
};

// ─── VERIFY CUSTOM DOMAIN ────────────────────────────────────────────
export const verifyCustomDomain = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, domainId } = req.params;
    const { token } = req.body;
    const user = req.user as IUser;
    const membership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only the owner can verify domains' });
    }
    const domainDoc = await AcademyDomain.findOne({ _id: domainId, academyId: id });
    if (!domainDoc) {
      return res.status(404).json({ success: false, message: 'Domain not found' });
    }
    if (domainDoc.verificationToken !== token) {
      return res.status(400).json({ success: false, message: 'Invalid verification token' });
    }
    domainDoc.verified = true;
    await domainDoc.save();
    // Update academy customDomain
    await Academy.findByIdAndUpdate(id, { customDomain: domainDoc.domain });
    res.json({ success: true, data: domainDoc });
  } catch (err) {
    next(err);
  }
};

// ─── GET ACADEMY STATS ───────────────────────────────────────────────
export const getAcademyStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as IUser;
    const membership = await AcademyMembership.findOne({ academyId: id, userId: user._id });
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    const totalStudents = await AcademyMembership.countDocuments({ academyId: id, role: 'student', status: 'active' });
    const totalInstructors = await AcademyMembership.countDocuments({ academyId: id, role: 'instructor', status: 'active' });
    const totalCourses = await Course.countDocuments({ academyId: id, isPublished: true });
    const totalRevenue = await Transaction.aggregate([
      { $match: { academyId: id, type: { $ne: 'withdrawal' }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalEnrollments = await Enrollment.countDocuments({ academyId: id });
    res.json({
      success: true,
      data: {
        totalStudents,
        totalInstructors,
        totalCourses,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalEnrollments,
      },
    });
  } catch (err) {
    next(err);
  }
};
