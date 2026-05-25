// ============================================
// FILE: src/middleware/validation.ts (Complete Updated - With Fixed Login Validation)
// ============================================
import { body, param, query } from 'express-validator';

export const validateRegistration = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('firstName').notEmpty().withMessage('First name is required').isLength({ max: 50 }),
  body('lastName').notEmpty().withMessage('Last name is required').isLength({ max: 50 }),
  body('referralCode').optional().isString().isLength({ min: 6, max: 10 }),
];

export const validateLogin = [
  body('email').notEmpty().withMessage('Email is required').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  body('twoFactorCode').optional().isString().isLength({ min: 6, max: 6 }),
];

export const validateCourseCreation = [
  body('title').notEmpty().isLength({ min: 5, max: 200 }),
  body('description').notEmpty().isLength({ min: 20, max: 500 }),
  body('longDescription').notEmpty().isLength({ min: 100 }),
  body('category').notEmpty(),
  body('level').isIn(['beginner', 'intermediate', 'advanced']),
  body('price').isFloat({ min: 0 }),
  body('thumbnail').isURL(),
];

export const validateCourseUpdate = [
  param('id').isMongoId(),
  body('title').optional().isLength({ min: 5, max: 200 }),
  body('description').optional().isLength({ min: 20, max: 500 }),
  body('price').optional().isFloat({ min: 0 }),
];

export const validateWithdrawal = [
  body('amount').isFloat({ min: 1000 }).withMessage('Minimum withdrawal is ₦1,000'),
  body('bankName').notEmpty(),
  body('accountNumber').isLength({ min: 10, max: 10 }).withMessage('Valid 10-digit account number required'),
  body('accountName').notEmpty(),
  body('bankCode').notEmpty(),
];

export const validateEnrollment = [
  param('courseId').isMongoId(),
  body('paymentMethod').optional().isIn(['wallet', 'stripe', 'paystack']),
];

export const validateLessonProgress = [
  param('courseId').isMongoId(),
  param('lessonId').isMongoId(),
  body('completed').optional().isBoolean(),
  body('timeSpent').optional().isInt({ min: 0 }),
];

export const validateProfileUpdate = [
  body('firstName').optional().isLength({ min: 1, max: 50 }),
  body('lastName').optional().isLength({ min: 1, max: 50 }),
  body('bio').optional().isLength({ max: 500 }),
  body('emailNotifications').optional().isBoolean(),
  body('preferredCurrency').optional().isIn(['NGN', 'USD', 'EUR', 'GBP']),
];

export const validatePasswordChange = [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
];

export const validateResetPassword = [
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
];

export const validateCreatePost = [
  body('content').notEmpty().isLength({ min: 1, max: 5000 }),
  body('type').optional().isIn(['text', 'image', 'video', 'link']),
  body('visibility').optional().isIn(['public', 'followers', 'only-me']),
];

export const validateCreateComment = [
  body('content').notEmpty().isLength({ min: 1, max: 2000 }),
  param('postId').isMongoId(),
];

export const validateCreateProduct = [
  body('title').notEmpty().isLength({ min: 3, max: 200 }),
  body('description').notEmpty().isLength({ min: 20 }),
  body('price').isFloat({ min: 0 }),
  body('category').notEmpty(),
  body('type').isIn(['digital', 'physical']),
  body('inventory').optional().isInt({ min: 0 }),
];

export const validateCreateJob = [
  body('title').notEmpty().isLength({ min: 5, max: 100 }),
  body('description').notEmpty().isLength({ min: 50 }),
  body('company').notEmpty(),
  body('location').notEmpty(),
  body('type').isIn(['full-time', 'part-time', 'contract', 'internship', 'freelance']),
  body('category').notEmpty(),
  body('experienceLevel').isIn(['entry', 'mid', 'senior', 'lead', 'executive']),
  body('deadline').isISO8601(),
  body('applicationEmail').isEmail(),
];

export const validatePagination = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const validateSearch = [
  query('search').optional().isString().isLength({ min: 2 }),
  query('category').optional().isString(),
  query('level').optional().isString(),
  query('sortBy').optional().isString(),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

export const validateSubscription = [
  body('plan').isIn(['premium', 'elite']).withMessage('Plan must be premium or elite'),
  body('paymentMethod').isIn(['wallet', 'stripe', 'paystack']).withMessage('Invalid payment method'),
  body('paymentReference').optional().isString(),
  body('couponCode').optional().isString().isLength({ min: 3, max: 20 }),
];
