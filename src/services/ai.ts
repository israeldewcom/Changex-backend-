// ============================================================
// FILE: src/services/ai.ts (UPDATED - added contextual awareness)
// ============================================================

import axios from 'axios';
import logger from '../utils/logger.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { IUser } from '../models/User.js';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

export const chatWithAI = async (prompt: string, isPremium: boolean, user?: IUser) => {
  if (!isPremium) {
    throw new Error('AI Tutor is available for Premium users only');
  }

  // Build contextual prompt
  let context = '';
  if (user) {
    const enrollments = await Enrollment.find({ userId: user._id }).populate('courseId', 'title');
    const courseNames = enrollments.map(e => (e.courseId as any)?.title).filter(Boolean).join(', ');
    context = `User: ${user.firstName} ${user.lastName}, Level ${user.level}, XP ${user.xp}, Enrolled in: ${courseNames || 'none'}. `;
  }

  const fullPrompt = `${context}User asks: ${prompt}`;

  try {
    const response = await axios.post(
      OPENROUTER_API,
      {
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: fullPrompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    logger.error('AI chat error:', error);
    throw new Error('AI service unavailable');
  }
};
