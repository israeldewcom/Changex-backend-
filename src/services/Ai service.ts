// ============================================
// FILE: src/services/AIService.ts (unchanged)
// ============================================
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RedisService } from './RedisService';
import { User } from '../models/User';
import { Course } from '../models/Course';

export class AIService {
  private static instance: AIService;
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;
  private redis: RedisService;

  private constructor() {
    this.openai = new OpenAI({ apiKey: config.openai.apiKey, organization: config.openai.orgId });
    this.gemini = new GoogleGenerativeAI(config.gemini.apiKey);
    this.redis = RedisService.getInstance();
  }

  static getInstance(): AIService {
    if (!AIService.instance) AIService.instance = new AIService();
    return AIService.instance;
  }

  async chatCompletion(userId: string, messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<string> {
    await this.checkRateLimit(userId);
    try {
      const model = options?.model || 'gpt-4-turbo-preview';
      const completion = await this.openai.chat.completions.create({ model, messages, temperature: options?.temperature || 0.7, max_tokens: options?.maxTokens || 1000 });
      const response = completion.choices[0]?.message?.content || '';
      await this.updateUsage(userId, response.length);
      return response;
    } catch (error) {
      logger.error('OpenAI chat completion failed:', error);
      return await this.geminiChatCompletion(messages);
    }
  }

  private async geminiChatCompletion(messages: Array<{ role: string; content: string }>): Promise<string> {
    try {
      const model = this.gemini.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = messages.map(m => m.content).join('\n');
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      logger.error('Gemini chat completion failed:', error);
      throw new Error('AI service unavailable');
    }
  }

  async generateRecommendations(userId: string): Promise<{ courses: any[]; personalizedMessage: string }> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    const enrolledCourses = await Course.find({ _id: { $in: user.coursesEnrolled } });
    const interests = enrolledCourses.map(c => c.category);
    const recommendedCourses = await Course.find({ _id: { $nin: user.coursesEnrolled }, published: true, category: { $in: interests } }).sort({ rating: -1, enrollmentCount: -1 }).limit(5);
    let personalizedMessage = "Continue your learning journey with our recommended courses!";
    try {
      const prompt = `User: ${user.firstName} ${user.lastName}\nLevel: ${user.level}\nXP: ${user.xp}\nCompleted courses: ${enrolledCourses.map(c => c.title).join(', ')}\nInterests: ${interests.join(', ')}\nGenerate a personalized recommendation message for this user to encourage them to continue learning. Keep it warm, motivating, and specific to their progress. Max 150 words.`;
      const response = await this.chatCompletion(userId, [{ role: 'system', content: 'You are a helpful learning assistant at ChangeX Academy.' }, { role: 'user', content: prompt }]);
      personalizedMessage = response;
    } catch (error) { logger.error('Failed to generate personalized message:', error); }
    return { courses: recommendedCourses, personalizedMessage };
  }

  async explainConcept(userId: string, concept: string, context?: string): Promise<string> {
    await this.checkRateLimit(userId);
    const prompt = `Explain the following concept in simple terms:\nConcept: ${concept}\n${context ? `Context: ${context}` : ''}\nProvide:\n1. A simple explanation (2-3 sentences)\n2. A real-world example\n3. Common pitfalls to avoid\n4. A practice exercise\nFormat the response in markdown.`;
    const response = await this.chatCompletion(userId, [{ role: 'system', content: 'You are an expert programming instructor at ChangeX Academy. Explain concepts clearly with examples.' }, { role: 'user', content: prompt }]);
    return response;
  }

  async debugCode(userId: string, code: string, errorMessage: string, language: string): Promise<string> {
    await this.checkRateLimit(userId);
    const prompt = `Debug the following ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`\nError: ${errorMessage}\nProvide:\n1. What's causing the error\n2. How to fix it\n3. The corrected code\n4. Best practices to avoid this error`;
    const response = await this.chatCompletion(userId, [{ role: 'system', content: 'You are a senior developer and debugging expert.' }, { role: 'user', content: prompt }]);
    return response;
  }

  async generateQuiz(userId: string, topic: string, difficulty: 'easy' | 'medium' | 'hard', numQuestions: number): Promise<Array<{ question: string; options: string[]; correctAnswer: string; explanation: string }>> {
    await this.checkRateLimit(userId);
    const prompt = `Generate a ${difficulty} difficulty quiz about "${topic}" with ${numQuestions} questions.\nFor each question, provide: the question text, 4 multiple choice options, the correct answer, an explanation of why it's correct.\nReturn as JSON array.`;
    const response = await this.chatCompletion(userId, [{ role: 'system', content: 'You are an expert quiz generator.' }, { role: 'user', content: prompt }]);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Failed to parse quiz JSON');
  }

  async analyzeSentiment(text: string, metadata?: any): Promise<{ sentiment: 'positive' | 'negative' | 'neutral'; score: number; keyTopics: string[] }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: 'Analyze the sentiment of the following text. Return JSON with sentiment (positive/negative/neutral), score (0-1), and key topics.' }, { role: 'user', content: text }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });
      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      return { sentiment: result.sentiment || 'neutral', score: result.score || 0.5, keyTopics: result.keyTopics || [] };
    } catch (error) {
      logger.error('Sentiment analysis failed:', error);
      return { sentiment: 'neutral', score: 0.5, keyTopics: [] };
    }
  }

  private async checkRateLimit(userId: string): Promise<void> {
    const key = `ai:usage:${userId}`;
    const usage = await this.redis.get<{ count: number; resetAt: string }>(key);
    if (usage) {
      const resetAt = new Date(usage.resetAt);
      if (new Date() > resetAt) {
        await this.redis.set(key, { count: 1, resetAt: new Date(Date.now() + 3600000).toISOString() }, 3600);
        return;
      }
      if (usage.count >= 100) throw new Error('AI usage limit exceeded. Upgrade your plan for more requests.');
      await this.redis.set(key, { count: usage.count + 1, resetAt: usage.resetAt }, Math.ceil((new Date(usage.resetAt).getTime() - Date.now()) / 1000));
    } else {
      await this.redis.set(key, { count: 1, resetAt: new Date(Date.now() + 3600000).toISOString() }, 3600);
    }
  }

  private async updateUsage(userId: string, tokens: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    await this.redis.hset(`ai:usage:daily:${today}`, userId, tokens);
    await this.redis.expire(`ai:usage:daily:${today}`, 86400);
  }
}
