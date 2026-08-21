// ============================================================
// FILE: src/controllers/ai-advanced.controller.ts
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import AIConversation from '../models/AIConversation.js';
import AIUsage from '../models/AIUsage.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import { chatWithAI } from '../services/ai.js';
import { getOrSetCache } from '../services/cache.js';
import { v4 as uuidv4 } from 'uuid';

// ─── ADVANCED AI CHAT WITH CONTEXT ──────────────────────────────────
export const advancedChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { message, sessionId, context } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    // Ensure session exists
    let session = await AIConversation.findOne({ userId: user._id, sessionId });
    if (!session) {
      session = await AIConversation.create({
        userId: user._id,
        sessionId: sessionId || uuidv4(),
        messages: [],
        context: context || {},
      });
    }

    // Add user message to history
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // Limit history to last 10 messages
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    // Build context for AI
    let aiContext = '';
    if (session.context?.courseId) {
      const course = await Course.findById(session.context.courseId);
      if (course) aiContext += `Course: ${course.title}. `;
    }
    if (session.context?.lessonId) {
      const lesson = await Lesson.findById(session.context.lessonId);
      if (lesson) aiContext += `Lesson: ${lesson.title}. `;
    }
    if (user.skillNodes) {
      const skills = Object.keys(user.skillNodes).filter(k => (user.skillNodes?.[k] || 0) < 50);
      if (skills.length) aiContext += `Skills to improve: ${skills.join(', ')}. `;
    }

    const fullPrompt = `${aiContext}User's question: ${message}`;

    // Get AI response
    const isPremium = user.isPremium || false;
    const aiResponse = await chatWithAI(fullPrompt, isPremium, user);

    // Add assistant response
    session.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date(),
    });
    await session.save();

    // Log usage
    await AIUsage.create({
      userId: user._id,
      action: 'chat',
      tokensUsed: Math.ceil(aiResponse.length / 4),
      metadata: { sessionId: session.sessionId },
    });

    res.json({
      success: true,
      data: {
        response: aiResponse,
        sessionId: session.sessionId,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GENERATE PRACTICE QUESTIONS ────────────────────────────────────
export const generatePractice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { topic, difficulty = 'medium', count = 3 } = req.body;

    if (!user.isPremium) {
      return res.status(403).json({ success: false, message: 'Practice questions require Premium' });
    }

    const prompt = `Generate ${count} practice questions on "${topic}" at ${difficulty} difficulty. Include multiple choice options and the correct answer.`;

    const aiResponse = await chatWithAI(prompt, true, user);

    // Parse response (simplified)
    const questions = aiResponse.split('\n\n').filter(Boolean).map((block, idx) => {
      const lines = block.split('\n');
      const question = lines[0] || `Question ${idx + 1}`;
      const options = lines.filter(l => l.match(/^[A-D]\)/)).map(l => l.replace(/^[A-D]\)\s*/, ''));
      const answer = lines.find(l => l.includes('Answer:'))?.replace('Answer:', '').trim() || 'A';
      return { question, options, correct: answer };
    });

    // Log usage
    await AIUsage.create({
      userId: user._id,
      action: 'practice',
      tokensUsed: Math.ceil(aiResponse.length / 4),
    });

    res.json({
      success: true,
      data: {
        questions,
        topic,
        difficulty,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── EVALUATE ANSWER ─────────────────────────────────────────────────
export const evaluateAnswer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { question, answer, expectedAnswer } = req.body;

    if (!user.isPremium) {
      return res.status(403).json({ success: false, message: 'Answer evaluation requires Premium' });
    }

    const prompt = `Evaluate the following answer to the question: "${question}". Expected answer: "${expectedAnswer}". Student's answer: "${answer}". Provide feedback, score out of 10, and suggestions for improvement.`;

    const aiResponse = await chatWithAI(prompt, true, user);

    await AIUsage.create({
      userId: user._id,
      action: 'feedback',
      tokensUsed: Math.ceil(aiResponse.length / 4),
    });

    res.json({
      success: true,
      data: {
        feedback: aiResponse,
      },
    });
  } catch (err) {
    next(err);
  }
};
